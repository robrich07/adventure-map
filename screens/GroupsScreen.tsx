import { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useGroups } from '../hooks/useGroups';
import { createGroup, joinGroup, Group } from '../lib/groups';
import { GroupDetailScreen } from './GroupDetailScreen';

type Props = {
  onViewGroupMap?: (group: Group) => void;
};

export function GroupsScreen({ onViewGroupMap }: Props) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const { groups, loading, refresh } = useGroups(userId);

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  const handleCreate = async () => {
    if (!groupName.trim()) {
      setError('Please enter a group name.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await createGroup(groupName.trim(), userId);
    setSubmitting(false);
    if (error) {
      console.log('[Groups] create failed:', error);
      setError(error);
      return;
    }
    console.log('[Groups] created group:', groupName.trim());
    setGroupName('');
    setShowCreate(false);
    refresh();
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      setError('Please enter an invite code.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await joinGroup(inviteCode.trim(), userId);
    setSubmitting(false);
    if (error) {
      console.log('[Groups] join failed:', error);
      setError(error);
      return;
    }
    console.log('[Groups] joined group with code:', inviteCode.trim());
    setInviteCode('');
    setShowJoin(false);
    refresh();
  };

  if (selectedGroup) {
    console.log('[Groups] viewing group:', selectedGroup.name);
    return (
      <GroupDetailScreen
        group={selectedGroup}
        onBack={() => {
          setSelectedGroup(null);
          refresh();
        }}
        onViewGroupMap={onViewGroupMap}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Groups</Text>

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.groupItem}
              onPress={() => setSelectedGroup(item)}
            >
              <Text style={styles.groupName}>{item.name}</Text>
              <Text style={styles.inviteCode}>Code: {item.invite_code}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>
              You are not in any groups yet.
            </Text>
          }
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {showCreate && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Group name"
            value={groupName}
            onChangeText={setGroupName}
          />
          {submitting ? <ActivityIndicator /> : (
            <TouchableOpacity style={styles.button} onPress={handleCreate}>
              <Text style={styles.buttonText}>Create</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {showJoin && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Enter invite code"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="characters"
          />
          {submitting ? <ActivityIndicator /> : (
            <TouchableOpacity style={styles.button} onPress={handleJoin}>
              <Text style={styles.buttonText}>Join</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => { setShowCreate(!showCreate); setShowJoin(false); setError(null); }}
        >
          <Text style={styles.buttonText}>
            {showCreate ? 'Cancel' : 'Create Group'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={() => { setShowJoin(!showJoin); setShowCreate(false); setError(null); }}
        >
          <Text style={styles.buttonText}>
            {showJoin ? 'Cancel' : 'Join Group'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 48 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  groupItem: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 10,
  },
  groupName: { fontSize: 16, fontWeight: '600' },
  inviteCode: { fontSize: 13, color: '#888', marginTop: 4 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  form: { marginVertical: 12, gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  button: {
    flex: 1,
    backgroundColor: '#3a86ff',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  error: { color: 'red', textAlign: 'center', marginVertical: 8 },
});
