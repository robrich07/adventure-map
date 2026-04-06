import { useState, useEffect, useCallback } from 'react';
import { FriendProfile, getFriends } from '../lib/friends';

// Returns the list of accepted friends for the user
// Exposes a refresh function so screens can reload after accepting requests or removing friends
export function useFriends(userId: string) {
    const [friends, setFriends] = useState<(FriendProfile & { friendshipId: string })[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!userId) {
            setFriends([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const data = await getFriends(userId);
        setFriends(data);
        setLoading(false);
    }, [userId]);

    useEffect(() => {
        load();
    }, [load]);

    return { friends, loading, refresh: load };
}
