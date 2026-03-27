import { useState, useEffect } from 'react';
import { GroupMember, getGroupMembers } from '../lib/groups';

// Returns the members of a specific group with their profile information
export function useGroupMembers(groupId: string) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await getGroupMembers(groupId);
      setMembers(data);
      setLoading(false);
    })();
  }, [groupId]);

  return { members, loading };
}
