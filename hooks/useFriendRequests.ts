import { useState, useEffect, useCallback } from 'react';
import { FriendRequest, getPendingFriendRequests } from '../lib/friends';

// Returns pending friend requests where the user is the addressee
// Exposes a refresh function so screens can reload after accepting or declining
export function useFriendRequests(userId: string) {
    const [requests, setRequests] = useState<FriendRequest[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!userId) {
            setRequests([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const data = await getPendingFriendRequests(userId);
        setRequests(data);
        setLoading(false);
    }, [userId]);

    useEffect(() => {
        load();
    }, [load]);

    return { requests, loading, refresh: load };
}
