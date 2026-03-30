import { supabase } from "./supabase";
import { INVITE_CODE_LENGTH } from "../constants/map";
import { tileToCircle, unionIntoMaster } from './tiles';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

// Generates a random uppercase alphanumeric invite code
// checks supabase to ensure uniqueness
async function generateUniqueInviteCode(length: number): Promise<string> {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789";

    while (true) {
        let code = '';
        for (let i = 0; i < length; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }

        const { data } = await supabase.from('groups').select('id').eq('invite_code', code).single();

        if (!data) return code;
    }
}

// creates new group, adds creator as member
export async function createGroup(name: string, userId: string): Promise<{ groupId: string | null; error: string | null }> {
    const inviteCode = await generateUniqueInviteCode(INVITE_CODE_LENGTH);

    const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({ name, invite_code: inviteCode, created_by: userId })
        .select('id')
        .single();

    if (groupError) return { groupId: null, error: groupError.message };

    const { error: memberError } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: userId});

    if (memberError) return { groupId: null, error: memberError.message };

    return { groupId: group.id, error: null };
}

// joins a group using invite code
export async function joinGroup(inviteCode: string, userId: string): Promise<{ groupId: string | null; error: string | null}> {
    const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('id')
        .eq('invite_code', inviteCode.toUpperCase().trim())
        .single();

    if (groupError || !group) return { groupId: null, error: 'Invalid invite code' };

    // check if member
    const { data: existing } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('group_id', group.id)
        .eq('user_id', userId)
        .single();

    if (existing) return { groupId: null, error: 'You are already a member of this group' };

    const { error: memberError } = await supabase
        .from('group_members')
        .insert({ group_id: group.id, user_id: userId});

    if (memberError) return { groupId: null, error: memberError.message };

    return { groupId: group.id, error: null };
}

// leaves group, if user is last member it deletes group
export async function leaveGroup(groupId: string, userId: string): Promise<{ error: string | null}> {
    const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

    if (error) return { error: error.message };

    // check remaining members
    const { data: remaining } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    // delete group if everyone left (big sad)
    if (!remaining || remaining.length === 0) {
        await supabase.from('groups').delete().eq('id', groupId);
    }

    return { error: null };
}

// Group schema shti
export type Group = {
    id: string;
    name: string;
    invite_code: string;
    created_by: string;
    created_at: string;
};

export type GroupMember = {
    user_id: string;
    joined_at: string;
    profiles: {
        username: string;
        email: string;
    } | null;
};

// Fetches those user's groups
export async function getUserGroups(userId: string): Promise<Group[]> {
    const { data, error } = await supabase
        .from('group_members')
        .select('groups(*)')
        .eq('user_id', userId);

    if (error || !data) return [];

    return data.map((row: any) => row.groups).filter(Boolean);
}

// Fetches those group members
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await supabase
        .from('group_members')
        .select(`
            user_id,
            joined_at,
            profiles!group_members_profile_id_fkey (
                username,
                email
            )
        `)
        .eq('group_id', groupId);

    if (error || !data) return [];

    return data as unknown as GroupMember[];
}

// Builds the group master polygon by fetching all unlocked tiles
// and unioning their circles client-side
export async function getGroupMasterPolygon(
    groupId: string
): Promise<Feature<Polygon | MultiPolygon> | null> {
    const { data, error } = await supabase
        .from('group_explored_tiles')
        .select('tile_x, tile_y')
        .eq('group_id', groupId);

    if (error || !data || data.length === 0) return null;

    let polygon: Feature<Polygon | MultiPolygon> | null = null;
    for (const row of data) {
        const circle = tileToCircle({ x: row.tile_x, y: row.tile_y });
        polygon = unionIntoMaster(polygon, circle);
    }

    return polygon;
}

// Cleans up expired pending tiles for all groups the user belongs to
export async function cleanupExpiredPendingTiles(userId: string): Promise<void> {
    const { data: memberships } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userId);

    if (!memberships || memberships.length === 0) return;

    const groupIds = memberships.map((m: any) => m.group_id);

    const { error } = await supabase
        .from('group_pending_tiles')
        .delete()
        .in('group_id', groupIds)
        .lt('expires_at', new Date().toISOString());

    if (error) {
        console.error('[Groups] failed to cleanup expired pending tiles:', error.message);
    } else {
        console.log('[Groups] cleaned up expired pending tiles');
    }
}
