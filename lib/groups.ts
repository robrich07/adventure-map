import { supabase } from "./supabase";
import { INVITE_CODE_LENGTH } from "../constants/map";
import { invalidateGroupCache } from '../tasks/locationTask';
import { areFriends } from './friends';
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

    invalidateGroupCache();
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

    invalidateGroupCache();
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

    invalidateGroupCache();
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

// Fetches the pre-built group master polygon from Supabase.
// The polygon is built server-side by process_group_tiles using PostGIS.
export async function getGroupMasterPolygon(
    groupId: string
): Promise<Feature<Polygon | MultiPolygon> | null> {
    const { data, error } = await supabase
        .rpc('get_group_polygon', { p_group_id: groupId })
        .single() as { data: { geojson: string | null } | null; error: any };

    if (error || !data || !data.geojson) return null;

    const geometry = JSON.parse(data.geojson);
    return { type: 'Feature', properties: {}, geometry } as Feature<Polygon | MultiPolygon>;
}

// Searches for public users by username prefix (used for group invites)
export async function searchUsers(
    query: string,
    currentUserId: string
): Promise<{ id: string; username: string; email: string }[]> {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, username, email')
        .ilike('username', `${query}%`)
        .eq('is_public', true)
        .neq('id', currentUserId)
        .limit(10);

    if (error || !data) return [];
    return data;
}

// Sends a group invite to a user
export async function sendGroupInvite(
    groupId: string,
    invitedUserId: string,
    invitedBy: string
): Promise<{ error: string | null }> {
    const { data: existing } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', invitedUserId)
        .single();

    if (existing) return { error: 'User is already a member of this group.' };

    // Must be friends to send a group invite (6-digit code bypass is separate)
    const friends = await areFriends(invitedBy, invitedUserId);
    if (!friends) return { error: 'You must be friends with this user to invite them.' };

    // Check for an existing invite
    const { data: existingInvite } = await supabase
        .from('group_invites')
        .select('id, status')
        .eq('group_id', groupId)
        .eq('invited_user_id', invitedUserId)
        .single();

    if (existingInvite) {
        if (existingInvite.status === 'pending') return { error: 'User has already been invited.' };
        // Re-invite a user who previously declined — reset to pending
        const { error: updateErr } = await supabase
            .from('group_invites')
            .update({ status: 'pending', invited_by: invitedBy })
            .eq('id', existingInvite.id);
        if (updateErr) return { error: updateErr.message };
        return { error: null };
    }

    const { error } = await supabase.from('group_invites').insert({
        group_id: groupId,
        invited_by: invitedBy,
        invited_user_id: invitedUserId,
    });

    if (error) return { error: error.message };
    return { error: null };
}

export type GroupInvite = {
    id: string;
    group_id: string;
    invited_by: string;
    status: 'pending' | 'accepted' | 'declined';
    created_at: string;
    groups: { name: string; invite_code: string } | null;
    inviter: { username: string } | null;
};

// Fetches all pending invites for the current user
export async function getPendingInvites(userId: string): Promise<GroupInvite[]> {
    const { data, error } = await supabase
        .from('group_invites')
        .select(`
            id,
            group_id,
            invited_by,
            status,
            created_at,
            groups ( name, invite_code ),
            inviter:profiles!group_invites_invited_by_fkey ( username )
        `)
        .eq('invited_user_id', userId)
        .eq('status', 'pending');

    if (error || !data) return [];
    return data as unknown as GroupInvite[];
}

// Accepts a group invite and adds the user to the group
export async function acceptGroupInvite(
    inviteId: string,
    groupId: string,
    userId: string
): Promise<{ error: string | null }> {
    // Insert member first — if this fails, the invite stays pending (safe to retry)
    const { error: memberError } = await supabase
        .from('group_members')
        .insert({ group_id: groupId, user_id: userId });

    if (memberError) return { error: memberError.message };

    // Only mark accepted after the member insert succeeds
    const { error: updateError } = await supabase
        .from('group_invites')
        .update({ status: 'accepted' })
        .eq('id', inviteId);

    if (updateError) return { error: updateError.message };

    invalidateGroupCache();
    return { error: null };
}

// Declines a group invite
export async function declineGroupInvite(
    inviteId: string
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('group_invites')
        .update({ status: 'declined' })
        .eq('id', inviteId);

    if (error) return { error: error.message };
    return { error: null };
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
