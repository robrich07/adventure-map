import { supabase } from './supabase';

export type Friendship = {
    id: string;
    requester_id: string;
    addressee_id: string;
    status: 'pending' | 'accepted' | 'declined' | 'removed';
    created_at: string;
    updated_at: string;
};

export type FriendProfile = {
    id: string;
    username: string;
    email: string;
};

export type FriendRequest = {
    id: string;
    requester_id: string;
    created_at: string;
    requester: { username: string; email: string } | null;
};

// Searches for public users by username prefix, excluding the current user
export async function searchPublicUsers(
    query: string,
    currentUserId: string
): Promise<FriendProfile[]> {
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

// Sends a friend request from requester to addressee.
// Checks that addressee is public and no duplicate/pending request exists.
// Re-sends if a previous request was declined or removed.
export async function sendFriendRequest(
    requesterId: string,
    addresseeId: string
): Promise<{ error: string | null }> {
    // Verify addressee is public
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('is_public')
        .eq('id', addresseeId)
        .single();

    if (profileError || !profile) return { error: 'User not found.' };
    if (!profile.is_public) return { error: 'This user has a private profile.' };

    // Check for existing friendship in either direction
    const { data: existing, error: existingError } = await supabase
        .from('friendships')
        .select('id, status, requester_id')
        .or(
            `and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),` +
            `and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`
        );

    if (existingError) return { error: existingError.message };

    if (existing && existing.length > 0) {
        const friendship = existing[0];

        if (friendship.status === 'accepted') return { error: 'You are already friends.' };
        if (friendship.status === 'pending') return { error: 'Friend request already pending.' };

        // Declined or removed — reset to pending with current requester as sender
        const { error: updateErr } = await supabase
            .from('friendships')
            .update({
                status: 'pending',
                requester_id: requesterId,
                addressee_id: addresseeId,
                updated_at: new Date().toISOString(),
            })
            .eq('id', friendship.id);

        if (updateErr) return { error: updateErr.message };
        return { error: null };
    }

    // No existing record — create new request
    const { error } = await supabase.from('friendships').insert({
        requester_id: requesterId,
        addressee_id: addresseeId,
    });

    if (error) return { error: error.message };
    return { error: null };
}

// Fetches pending friend requests where the user is the addressee
export async function getPendingFriendRequests(
    userId: string
): Promise<FriendRequest[]> {
    const { data, error } = await supabase
        .from('friendships')
        .select(`
            id,
            requester_id,
            created_at,
            requester:profiles!friendships_requester_id_fkey ( username, email )
        `)
        .eq('addressee_id', userId)
        .eq('status', 'pending');

    if (error || !data) return [];
    return data as unknown as FriendRequest[];
}

// Accepts a pending friend request
export async function acceptFriendRequest(
    friendshipId: string
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);

    if (error) return { error: error.message };
    return { error: null };
}

// Declines a pending friend request
export async function declineFriendRequest(
    friendshipId: string
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('friendships')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);

    if (error) return { error: error.message };
    return { error: null };
}

// Removes an existing friendship
export async function removeFriend(
    friendshipId: string
): Promise<{ error: string | null }> {
    const { error } = await supabase
        .from('friendships')
        .update({ status: 'removed', updated_at: new Date().toISOString() })
        .eq('id', friendshipId);

    if (error) return { error: error.message };
    return { error: null };
}

// Fetches all accepted friends for a user.
// Queries both directions (user as requester and as addressee) and merges results.
export async function getFriends(userId: string): Promise<(FriendProfile & { friendshipId: string })[]> {
    // Friends where user is the requester — get addressee profiles
    const { data: asRequester, error: err1 } = await supabase
        .from('friendships')
        .select(`
            id,
            addressee:profiles!friendships_addressee_id_fkey ( id, username, email )
        `)
        .eq('requester_id', userId)
        .eq('status', 'accepted');

    // Friends where user is the addressee — get requester profiles
    const { data: asAddressee, error: err2 } = await supabase
        .from('friendships')
        .select(`
            id,
            requester:profiles!friendships_requester_id_fkey ( id, username, email )
        `)
        .eq('addressee_id', userId)
        .eq('status', 'accepted');

    if (err1) console.error('[Friends] error fetching as requester:', err1.message);
    if (err2) console.error('[Friends] error fetching as addressee:', err2.message);

    const friends: (FriendProfile & { friendshipId: string })[] = [];
    const seen = new Set<string>();

    for (const row of (asRequester ?? []) as any[]) {
        const profile = row.addressee;
        if (profile && !seen.has(profile.id)) {
            seen.add(profile.id);
            friends.push({ id: profile.id, username: profile.username, email: profile.email, friendshipId: row.id });
        }
    }

    for (const row of (asAddressee ?? []) as any[]) {
        const profile = row.requester;
        if (profile && !seen.has(profile.id)) {
            seen.add(profile.id);
            friends.push({ id: profile.id, username: profile.username, email: profile.email, friendshipId: row.id });
        }
    }

    return friends;
}

// Checks if two users have an accepted friendship in either direction
export async function areFriends(
    userId1: string,
    userId2: string
): Promise<boolean> {
    const { data, error } = await supabase
        .from('friendships')
        .select('id')
        .or(
            `and(requester_id.eq.${userId1},addressee_id.eq.${userId2}),` +
            `and(requester_id.eq.${userId2},addressee_id.eq.${userId1})`
        )
        .eq('status', 'accepted')
        .limit(1);

    if (error) {
        console.error('[Friends] areFriends check error:', error.message);
        return false;
    }

    return (data?.length ?? 0) > 0;
}

// Gets the current profile visibility setting
export async function getProfileVisibility(
    userId: string
): Promise<boolean> {
    const { data, error } = await supabase
        .from('profiles')
        .select('is_public')
        .eq('id', userId)
        .single();

    if (error || !data) return true;
    return data.is_public;
}

// Updates profile visibility. When going private, removes all friendships.
export async function setProfileVisibility(
    userId: string,
    isPublic: boolean
): Promise<{ error: string | null }> {
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_public: isPublic })
        .eq('id', userId);

    if (updateError) return { error: updateError.message };

    // Going private — remove all pending and accepted friendships
    if (!isPublic) {
        const { error: friendError } = await supabase
            .from('friendships')
            .update({ status: 'removed', updated_at: new Date().toISOString() })
            .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
            .in('status', ['pending', 'accepted']);

        if (friendError) {
            console.error('[Friends] error removing friendships on privacy change:', friendError.message);
            return { error: friendError.message };
        }
    }

    return { error: null };
}
