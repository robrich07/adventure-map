import { useState, useEffect, useRef } from 'react';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { getGroupMasterPolygon, cleanupExpiredPendingTiles } from '../lib/groups';
import { LOCATION_UPDATE_INTERVAL_MS } from '../constants/map';

// Fetches and polls the group master polygon from Supabase.
// Also cleans up expired pending tiles on mount.
export function useGroupMasterPolygon(
    groupId: string,
    userId: string
): Feature<Polygon | MultiPolygon> | null {
    const [masterPolygon, setMasterPolygon] = useState<Feature<Polygon | MultiPolygon> | null>(null);
    // Track stringified polygon to avoid re-renders when nothing changed
    const lastJsonRef = useRef<string>('null');

    useEffect(() => {
        // Skip if no group selected
        if (!groupId) return;

        let interval: ReturnType<typeof setInterval>;

        // Only updates state if the polygon actually changed
        const updateIfChanged = (polygon: Feature<Polygon | MultiPolygon> | null) => {
            const json = polygon ? JSON.stringify(polygon.geometry) : 'null';
            if (json === lastJsonRef.current) return;
            console.log('[useGroupMasterPolygon] polygon changed, updating');
            lastJsonRef.current = json;
            setMasterPolygon(polygon);
        };

        (async () => {
            await cleanupExpiredPendingTiles(userId);

            const polygon = await getGroupMasterPolygon(groupId);
            updateIfChanged(polygon);

            // Poll for updates — polygon is built server-side so this is a cheap read
            interval = setInterval(async () => {
                const updated = await getGroupMasterPolygon(groupId);
                updateIfChanged(updated);
            }, LOCATION_UPDATE_INTERVAL_MS * 2);
        })();

        return () => {
            clearInterval(interval);
            // Reset when switching away from group
            lastJsonRef.current = 'null';
            setMasterPolygon(null);
        };
    }, [groupId, userId]);

    return masterPolygon;
}
