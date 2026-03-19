import * as SQLite from 'expo-sqlite';
import { TileId, tileKey } from './tiles';

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
            await db.execAsync(`
                CREATE TABLE IF NOT EXISTS explored_tiles (
                    id TEXT PRIMARY KEY,
                    tile_x INTEGER NOT NULL,
                    tile_y INTEGER NOT NULL,
                    first_visited INTEGER NOT NULL,
                    last_visited INTEGER NOT NULL,
                    visit_count INTEGER NOT NULL DEFAULT 1
                );
            `);
        })();
    }
    return dbInitializing;
}

// Inserts a tile if it has not yet been visited, or updates last_visited and visit_count if it has
export async function upsertTile(tile: TileId): Promise<void> {
    if (!db) throw new Error('Database not initialized');

    const now = Date.now();
    const key = tileKey(tile);
    await db.runAsync(
        `INSERT INTO explored_tiles (id, tile_x, tile_y, first_visited, last_visited, visit_count)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
            last_visited = ?,
            visit_count = visit_count + 1;`,
        [key, tile.x, tile.y, now, now, now]
    );
}

// Returns all explored tiles from db
export async function getAllTiles(): Promise<TileId[]> {
    if (!db) throw new Error('Database not initialized');

    const rows = await db.getAllAsync<{ tile_x: number; tile_y: number }>(
        'SELECT tile_x, tile_y FROM explored_tiles;'
    );

    return rows.map(row => ({ x:row.tile_x, y:row.tile_y }));
}