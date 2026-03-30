import * as TaskManager from 'expo-task-manager';
import { LocationObject } from 'expo-location';
import { coordsToTile } from '../lib/tiles';
import { upsertTile, initDatabase } from '../lib/database';
import { LOCATION_TASK_NAME } from '../constants/map';
import { supabase } from '../lib/supabase';

// Background location task, fires whenever OS delivers new location update
// initDatabase called here and in App.tsx bc background task runs in separate context and can't rely on it being done
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
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

    for (const location of locations) {
        const tile = coordsToTile(
            location.coords.latitude,
            location.coords.longitude
        );
        console.log('[Location] tile explored:', tile.x, tile.y, 'at', location.coords.latitude.toFixed(5), location.coords.longitude.toFixed(5));

        // Local SQLite upsert — instant, works offline
        await upsertTile(tile, session.user.id);

        // Single RPC call handles both personal tile sync and group processing
        supabase.rpc('process_tile_visit', {
            p_tile_x: tile.x,
            p_tile_y: tile.y,
            p_user_id: session.user.id,
        }).then(({ error: rpcError }) => {
            if (rpcError) console.error('[Location] RPC error:', rpcError.message);
        });
    }
});
