import { useState, useEffect, useRef } from 'react';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import * as turf from '@turf/turf';
import {
    initDatabase,
    getMasterPolygon,
    saveMasterPolygon,
    syncMasterPolygonFromSupabase,
    syncMasterPolygonToSupabase,
    syncTilesFromSupabase,
    getAllTiles,
} from '../lib/database';
import { tileToCircle } from '../lib/tiles';
import { LOCATION_UPDATE_INTERVAL_MS } from '../constants/map';

// How often to push the local master polygon to Supabase (30 seconds)
const POLYGON_SYNC_INTERVAL_MS = 30_000;

// Loads the master polygon from SQLite on mount, syncing from Supabase first.
// Falls back to rebuilding from individual tiles if the master polygon is missing.
// Polls for updates written by the background location task.
// Periodically syncs the local master polygon to Supabase as a backup.
export function useMasterPolygon(
    userId: string
): Feature<Polygon | MultiPolygon> | null {
    const [masterPolygon, setMasterPolygon] = useState<Feature<Polygon | MultiPolygon> | null>(null);
    const lastSyncJsonRef = useRef<string>('');

    useEffect(() => {
        if (!userId) return;
        let pollInterval: ReturnType<typeof setInterval>;
        let syncInterval: ReturnType<typeof setInterval>;

        (async () => {
            await initDatabase();

            // Try to restore master polygon from Supabase
            await syncMasterPolygonFromSupabase(userId);
            let stored = await getMasterPolygon(userId);

            // Fallback: rebuild master polygon from individual tiles if missing
            if (!stored) {
                await syncTilesFromSupabase(userId);
                const tiles = await getAllTiles(userId);

                if (tiles.length > 0) {
                    const circles = tiles.map(tileToCircle);
                    const merged = circles.length === 1
                        ? circles[0]
                        : turf.union(turf.featureCollection(circles))!;
                    await saveMasterPolygon(userId, merged);
                    await syncMasterPolygonToSupabase(userId, merged);
                    stored = merged;
                }
            }

            if (stored) {
                lastSyncJsonRef.current = JSON.stringify(stored.geometry);
            }
            setMasterPolygon(stored);

            // Poll for updates written by background task
            pollInterval = setInterval(async () => {
                const updated = await getMasterPolygon(userId);
                setMasterPolygon(updated);
            }, LOCATION_UPDATE_INTERVAL_MS);

            // Periodically push local master polygon to Supabase
            syncInterval = setInterval(async () => {
                const current = await getMasterPolygon(userId);
                if (!current) return;
                const json = JSON.stringify(current.geometry);
                if (json === lastSyncJsonRef.current) return;
                lastSyncJsonRef.current = json;
                console.log('[Polygon] syncing master polygon to Supabase');
                syncMasterPolygonToSupabase(userId, current).catch(err =>
                    console.error('[Polygon] sync error:', err)
                );
            }, POLYGON_SYNC_INTERVAL_MS);
        })();

        return () => {
            clearInterval(pollInterval);
            clearInterval(syncInterval);
        };
    }, [userId]);

    return masterPolygon;
}
