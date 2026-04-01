import { useState, useEffect, useCallback } from 'react';
import { GroupInvite, getPendingInvites } from '../lib/groups';

export function useGroupInvites(userId: string) {
    const [invites, setInvites] = useState<GroupInvite[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const data = await getPendingInvites(userId);
        setInvites(data);
        setLoading(false);
    }, [userId]);

    useEffect(() => {
        load();
    }, [load]);

    return { invites, loading, refresh: load };
}
