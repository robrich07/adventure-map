import * as TaskManager from 'expo-task-manager';
import { LocationObject } from 'expo-location';
import { coordsToTile, tileKey, interpolateTiles, haversineDistanceM } from '../lib/tiles';
import { upsertTile, upsertTilesBatch, initDatabase } from '../lib/database';
import { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL_MS, INTERPOLATION_MAX_SPEED_MPS, INTERPOLATION_MAX_DISTANCE_M } from '../constants/map';
import { supabase } from '../lib/supabase';

// Track the last tile to distinguish new visits from dwell ticks
let lastTileKey: string | null = null;

// Track previous location for tile interpolation between updates
let lastCoords: { latitude: number; longitude: number } | null = null;
let lastTimestamp: number | null = null; // fallback for speed calc when coords.speed is unavailable

// Cache group membership to avoid querying Supabase on every tile visit.
// Refreshes every 5 minutes.
let cachedHasGroups: boolean | null = null;
let lastGroupCheck = 0;
const GROUP_CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function userHasGroups(userId: string): Promise<boolean> {
    const now = Date.now();
    if (cachedHasGroups !== null && now - lastGroupCheck < GROUP_CHECK_INTERVAL_MS) {
        return cachedHasGroups;
    }

    const { data, error } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId)
        .limit(1);

    if (error) {
        console.error('[Location] group membership check error:', error.message);
        // If we can't check, assume they have groups to be safe
        return cachedHasGroups ?? true;
    }

    cachedHasGroups = (data?.length ?? 0) > 0;
    lastGroupCheck = now;
    console.log('[Location] group membership check:', cachedHasGroups ? 'has groups' : 'no groups');
    return cachedHasGroups;
}

// Force a refresh on next check (called when user joins/leaves a group)
export function invalidateGroupCache(): void {
    cachedHasGroups = null;
    lastGroupCheck = 0;
}

// Background location task, fires whenever OS delivers new location update
// initDatabase called here and in App.tsx bc background task runs in separate context and can't rely on it being done
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
    console.log('[Location] background task fired, hasData:', !!data, 'hasError:', !!error, 'locations:', data?.locations?.length ?? 0);

    if (error) {
        console.error('[Location] background task error:', error);
        return;
    }

    if (!data) return;

    const { locations } = data as { locations: LocationObject[] };

    await initDatabase();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
        console.warn('[Location] no session in background task');
        return;
    }

    const hasGroups = await userHasGroups(session.user.id);

    const dwellSeconds = Math.round(LOCATION_UPDATE_INTERVAL_MS / 1000);

    for (const location of locations) {
        const lat = location.coords.latitude;
        const lng = location.coords.longitude;
        const tile = coordsToTile(lat, lng);
        const currentKey = tileKey(tile);
        const isNewVisit = currentKey !== lastTileKey;

        // Interpolate tiles between previous and current location to fill gaps at speed
        if (lastCoords) {
            const distanceM = haversineDistanceM(lastCoords.latitude, lastCoords.longitude, lat, lng);
            // Prefer OS-reported speed (GPS Doppler), fall back to distance/time
            const speedMps = location.coords.speed != null && location.coords.speed >= 0
                ? location.coords.speed
                : lastTimestamp ? distanceM / Math.max((location.timestamp - lastTimestamp) / 1000, 0.1) : 0;

            if (distanceM <= INTERPOLATION_MAX_DISTANCE_M && speedMps <= INTERPOLATION_MAX_SPEED_MPS) {
                const interpolated = interpolateTiles(lastCoords.latitude, lastCoords.longitude, lat, lng)
                    .filter(t => tileKey(t) !== lastTileKey && tileKey(t) !== currentKey);

                if (interpolated.length > 0) {
                    console.log(`[Location] interpolating ${interpolated.length} tiles (speed=${(speedMps * 2.237).toFixed(1)}mph dist=${distanceM.toFixed(0)}m)`);
                    await upsertTilesBatch(interpolated, session.user.id, 0);

                    // Fire group RPCs for each interpolated tile
                    if (hasGroups) {
                        for (const t of interpolated) {
                            supabase.rpc('process_group_tiles', {
                                p_tile_x: t.x,
                                p_tile_y: t.y,
                                p_user_id: session.user.id,
                            }).then(({ error: rpcError }) => {
                                if (rpcError) console.error('[Location] interpolation group RPC error:', rpcError.message);
                            });
                        }
                    }
                }
            } else {
                console.log(`[Location] skipping interpolation (speed=${(speedMps * 2.237).toFixed(1)}mph dist=${distanceM.toFixed(0)}m)`);
            }
        }

        if (isNewVisit) {
            console.log('[Location] tile explored:', tile.x, tile.y, 'at', lat.toFixed(5), lng.toFixed(5));
        }

        // Local SQLite upsert + Supabase sync via RPC
        await upsertTile(tile, session.user.id, isNewVisit, dwellSeconds);
        lastTileKey = currentKey;
        lastCoords = { latitude: lat, longitude: lng };
        lastTimestamp = location.timestamp;

        // Only call group RPC for new tile visits (dwell ticks don't affect groups)
        if (isNewVisit && hasGroups) {
            supabase.rpc('process_group_tiles', {
                p_tile_x: tile.x,
                p_tile_y: tile.y,
                p_user_id: session.user.id,
            }).then(({ error: rpcError }) => {
                if (rpcError) console.error('[Location] RPC error:', rpcError.message);
            });
        }
    }
});
