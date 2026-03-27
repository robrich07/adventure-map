import { useState, useEffect, useCallback } from 'react';
import { Group, getUserGroups } from '../lib/groups';

// Returns the list of groups the user belongs to
// Exposes a refresh function so screens can reload after creating or joining a group
export function useGroups(userId: string) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await getUserGroups(userId);
    setGroups(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { groups, loading, refresh: load };
}
