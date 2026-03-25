import { useState, useEffect } from 'react';
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

// Loads the master polygon from SQLite on mount, syncing from Supabase first.
// Falls back to rebuilding from individual tiles if the master polygon is missing.
// Polls for updates written by the background location task.
export function useMasterPolygon(
    userId: string
): Feature<Polygon | MultiPolygon> | null {
    const [masterPolygon, setMasterPolygon] = useState<Feature<Polygon | MultiPolygon> | null>(null);

    useEffect(() => {
        if (!userId) return;
        let interval: ReturnType<typeof setInterval>;

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

            setMasterPolygon(stored);

            // Poll for updates written by background task
            interval = setInterval(async () => {
                const updated = await getMasterPolygon(userId);
                setMasterPolygon(updated);
            }, LOCATION_UPDATE_INTERVAL_MS);
        })();

        return () => clearInterval(interval);
    }, [userId]);

    return masterPolygon;
}
