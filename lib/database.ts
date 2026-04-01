import * as SQLite from 'expo-sqlite';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { TileId, tileKey, tileToCircle, unionIntoMaster, getNeighborTiles } from './tiles';
import { supabase } from './supabase';

const DB_NAME = 'adventure-map.db'

let db: SQLite.SQLiteDatabase | null = null;
// Prevents concurrent callers from each opening their own connection
let dbInitializing: Promise<void> | null = null;

// Opens db and creates explored_tiles table if it doesn't exist.
// Must be called before other db functions.
// Guards against concurrent calls from useTiles and the background task.
export async function initDatabase(): Promise<void> {
    if (db) return;
    if (!dbInitializing) {
        dbInitializing = (async () => {
            db = await SQLite.openDatabaseAsync(DB_NAME);

            const tableInfo = await db.getAllAsync<{ name: string }>(
                'PRAGMA table_info(explored_tiles);'
            );
            const hasUserId = tableInfo.some(col => col.name === 'user_id');
            const hasTimeSpent = tableInfo.some(col => col.name === 'time_spent');

            if (!hasUserId) {
                await db.execAsync('DROP TABLE IF EXISTS explored_tiles;');
            }
            // Migrate existing tables to add time_spent column
            if (hasUserId && !hasTimeSpent) {
                await db.execAsync('ALTER TABLE explored_tiles ADD COLUMN time_spent INTEGER NOT NULL DEFAULT 0;');
            }
            await db.execAsync(`
                CREATE TABLE IF NOT EXISTS explored_tiles (
                    id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    tile_x INTEGER NOT NULL,
                    tile_y INTEGER NOT NULL,
                    first_visited INTEGER NOT NULL,
                    last_visited INTEGER NOT NULL,
                    visit_count INTEGER NOT NULL DEFAULT 1,
                    time_spent INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (id, user_id)
                );

                CREATE TABLE IF NOT EXISTS master_polygon (
                    user_id TEXT PRIMARY KEY,
                    geojson TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );
            `);
        })();
    }
    return dbInitializing;
}

// Records a tile visit. isNewVisit=true increments visit_count (entering a new tile),
// isNewVisit=false just adds dwell time (still in the same tile).
// dwellSeconds is the time interval since last location tick.
export async function upsertTile(
    tile: TileId,
    userId: string,
    isNewVisit: boolean,
    dwellSeconds: number
): Promise<void> {
    if (!db) throw new Error('Database not initialized');

    const now = Date.now();
    const key = tileKey(tile);

    if (isNewVisit) {
        // First time entering this tile (or re-entering after leaving)
        await db.runAsync(
            `INSERT INTO explored_tiles (id, user_id, tile_x, tile_y, first_visited, last_visited, visit_count, time_spent)
             VALUES (?, ?, ?, ?, ?, ?, 1, 0)
             ON CONFLICT(id, user_id) DO UPDATE SET
                last_visited = ?,
                visit_count = visit_count + 1;`,
            [key, userId, tile.x, tile.y, now, now, now]
        );

        // Update master polygon incrementally — build tile set from all tiles so connectors work
        const current = await getMasterPolygon(userId);
        const circle = tileToCircle(tile);
        const allTiles = await getAllTiles(userId);
        const tileSet = new Set(allTiles.map(t => tileKey(t)));
        const updated = unionIntoMaster(current, circle, tile, tileSet);
        await saveMasterPolygon(userId, updated);
    } else {
        // Still in the same tile — just update dwell time
        await db.runAsync(
            `UPDATE explored_tiles SET last_visited = ?, time_spent = time_spent + ?
             WHERE id = ? AND user_id = ?;`,
            [now, dwellSeconds, key, userId]
        );
    }

    // Sync to Supabase via RPC (non-blocking)
    supabase.rpc('upsert_explored_tile', {
        p_tile_x: tile.x,
        p_tile_y: tile.y,
        p_user_id: userId,
        p_is_new_visit: isNewVisit,
        p_dwell_seconds: dwellSeconds,
    }).then(({ error }) => {
        if (error) console.error('[Tiles] Supabase sync error:', error.message);
    });
}

// Returns all explored tiles from db
export async function getAllTiles(userId: string): Promise<TileId[]> {
    if (!db) throw new Error('Database not initialized');

    const rows = await db.getAllAsync<{ tile_x: number; tile_y: number }>(
        'SELECT tile_x, tile_y FROM explored_tiles WHERE user_id = ?;',
        [userId]
    );

    return rows.map(row => ({ x:row.tile_x, y:row.tile_y }));
}

// Fetch all explored tiles directly from Supabase
export async function getAllTilesFromSupabase(userId: string): Promise<TileId[]> {
    const { data, error } = await supabase
        .from('explored_tiles')
        .select('tile_x, tile_y')
        .eq('user_id', userId);

    if (error) {
        console.error('Failed to fetch tiles from Supabase:', error.message);
        return [];
    }

    return (data ?? []).map(row => ({ x: row.tile_x, y: row.tile_y }));
}

// Get tiles from supabase and sync into local SQLite
export async function syncTilesFromSupabase(userId: string): Promise<void> {
    const { data, error } = await supabase
    .from('explored_tiles')
    .select('id, tile_x, tile_y, first_visited, last_visited, visit_count')
    .eq('user_id', userId);

    if (error) {
        console.error('Failed to fetch tiles from Supabase:', error.message);
        return;
    }

    if (!data || !db) return;

    for (const row of data) {
        await db.runAsync(
            `INSERT OR IGNORE INTO explored_tiles (id, user_id, tile_x, tile_y, first_visited, last_visited, visit_count)
            VALUES (?, ?, ?, ?, ?, ?, ?);`,
            [row.id, userId, row.tile_x, row.tile_y, row.first_visited, row.last_visited, row.visit_count]
        );
    }
}

// Get master polygon from SQLite
export async function getMasterPolygon(
    userId: string
): Promise<Feature<Polygon | MultiPolygon> | null> {
    if (!db) throw new Error('Database not initialized');

    const row = await db.getFirstAsync<{ geojson: string }>(
        'SELECT geojson FROM master_polygon WHERE user_id = ?;',
        [userId]
    );

    if (!row) return null;
    return JSON.parse(row.geojson);
}

// Save master polygon to SQLite
export async function saveMasterPolygon(
    userId: string,
    polygon: Feature<Polygon | MultiPolygon>
): Promise<void> {
    if (!db) throw new Error('Database not initialized');

    const now = Date.now();
    await db.runAsync(
        `INSERT INTO master_polygon (user_id, geojson, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
             geojson = ?,
             updated_at = ?;`,
        [userId, JSON.stringify(polygon), now, JSON.stringify(polygon), now]
    );
}

// Push master polygon to Supabase
export async function syncMasterPolygonToSupabase(
    userId: string,
    polygon: Feature<Polygon | MultiPolygon>
): Promise<void> {
    // PostGIS column is typed as MultiPolygon, so promote Polygon if needed
    const geometry = polygon.geometry.type === 'Polygon'
        ? { type: 'MultiPolygon' as const, coordinates: [polygon.geometry.coordinates] }
        : polygon.geometry;

    const { error } = await supabase
        .from('user_master_polygon')
        .upsert({
            user_id: userId,
            polygon: geometry,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

    if (error) {
        console.error('Failed to sync master polygon to Supabase:', error.message);
    }
}

// Pull master polygon from Supabase into SQLite
export async function syncMasterPolygonFromSupabase(userId: string): Promise<void> {
    const { data, error } = await supabase
        .from('user_master_polygon')
        .select('polygon')
        .eq('user_id', userId)
        .single();

    if (error || !data || !db) return;

    // Supabase returns raw geometry from PostGIS, wrap it back into a Feature
    const feature: Feature<Polygon | MultiPolygon> = {
        type: 'Feature',
        properties: {},
        geometry: data.polygon as Polygon | MultiPolygon,
    };

    const now = Date.now();
    await db.runAsync(
        `INSERT INTO master_polygon (user_id, geojson, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
             geojson = ?,
             updated_at = ?;`,
        [userId, JSON.stringify(feature), now, JSON.stringify(feature), now]
    );
}