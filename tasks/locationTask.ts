import * as TaskManager from 'expo-task-manager';
import { LocationObject } from 'expo-location';
import { coordsToTile } from '../lib/tiles';
import { upsertTile, initDatabase } from '../lib/database';
import { LOCATION_TASK_NAME } from '../constants/map';
import { supabase } from '../lib/supabase';

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

    for (const location of locations) {
        const tile = coordsToTile(
            location.coords.latitude,
            location.coords.longitude
        );
        console.log('[Location] tile explored:', tile.x, tile.y, 'at', location.coords.latitude.toFixed(5), location.coords.longitude.toFixed(5));

        // Local SQLite upsert — instant, works offline
        await upsertTile(tile, session.user.id);

        // Only call Supabase if user is in at least one group
        if (hasGroups) {
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
