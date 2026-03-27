import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { leaveGroup, Group } from '../lib/groups';

type Props = {
  group: Group;
  onBack: () => void;
};

export function GroupDetailScreen({ group, onBack }: Props) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';
  const { members, loading } = useGroupMembers(group.id);

  const handleLeave = () => {
    Alert.alert(
      'Leave Group',
      `Are you sure you want to leave ${group.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            const { error } = await leaveGroup(group.id, userId);
            if (error) {
              console.log('[Groups] leave failed:', error);
              Alert.alert('Error', error);
              return;
            }
            console.log('[Groups] left group:', group.name);
            onBack();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{group.name}</Text>
      <Text style={styles.code}>Invite code: {group.invite_code}</Text>

      <Text style={styles.sectionTitle}>Members</Text>

      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={members}
          keyExtractor={item => item.user_id}
          renderItem={({ item }) => (
            <View style={styles.memberItem}>
              <Text style={styles.memberName}>
                {item.profiles?.username ?? 'Unknown'}
                {item.user_id === userId ? ' (you)' : ''}
              </Text>
              <Text style={styles.memberEmail}>{item.profiles?.email ?? ''}</Text>
            </View>
          )}
        />
      )}

      <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
        <Text style={styles.leaveText}>Leave Group</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 48 },
  back: { marginBottom: 16 },
  backText: { color: '#3a86ff', fontSize: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  code: { fontSize: 14, color: '#888', marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  memberItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 8,
  },
  memberName: { fontSize: 15, fontWeight: '500' },
  memberEmail: { fontSize: 13, color: '#888', marginTop: 2 },
  leaveButton: {
    marginTop: 24,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff3b30',
    alignItems: 'center',
  },
  leaveText: { color: '#ff3b30', fontWeight: 'bold' },
});
