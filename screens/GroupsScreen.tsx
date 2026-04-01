import { useState } from 'react';
import {
    View, Text, FlatList, TouchableOpacity,
    TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useGroups } from '../hooks/useGroups';
import { useGroupInvites } from '../hooks/useGroupInvites';
import { createGroup, joinGroup, acceptGroupInvite, declineGroupInvite, Group } from '../lib/groups';
import { GroupDetailScreen } from './GroupDetailScreen';

type Props = {
    onViewGroupMap?: (group: Group) => void;
};

export function GroupsScreen({ onViewGroupMap }: Props) {
    const { session } = useAuth();
    const userId = session?.user?.id ?? '';
    const { groups, loading, refresh } = useGroups(userId);
    const { invites, loading: invitesLoading, refresh: refreshInvites } = useGroupInvites(userId);

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

    const handleAcceptInvite = async (inviteId: string, groupId: string) => {
        const { error } = await acceptGroupInvite(inviteId, groupId, userId);
        if (error) {
            console.log('[Groups] accept invite failed:', error);
            setError(error);
            return;
        }
        console.log('[Groups] accepted invite');
        refresh();
        refreshInvites();
    };

    const handleDeclineInvite = async (inviteId: string) => {
        const { error } = await declineGroupInvite(inviteId);
        if (error) {
            console.log('[Groups] decline invite failed:', error);
            setError(error);
            return;
        }
        console.log('[Groups] declined invite');
        refreshInvites();
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

            {/* Pending invites section */}
            {!invitesLoading && invites.length > 0 && (
                <View style={styles.invitesSection}>
                    <Text style={styles.invitesSectionTitle}>Pending Invites</Text>
                    {invites.map(invite => (
                        <View key={invite.id} style={styles.inviteItem}>
                            <View style={styles.inviteInfo}>
                                <Text style={styles.inviteGroupName}>
                                    {invite.groups?.name ?? 'Unknown Group'}
                                </Text>
                                <Text style={styles.inviteFrom}>
                                    from {invite.inviter?.username ?? 'unknown'}
                                </Text>
                            </View>
                            <View style={styles.inviteActions}>
                                <TouchableOpacity
                                    style={styles.acceptButton}
                                    onPress={() => handleAcceptInvite(invite.id, invite.group_id)}
                                >
                                    <Text style={styles.acceptText}>Accept</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.declineButton}
                                    onPress={() => handleDeclineInvite(invite.id)}
                                >
                                    <Text style={styles.declineText}>Decline</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            )}

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
    invitesSection: { marginBottom: 16 },
    invitesSectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
    inviteItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderWidth: 1,
        borderColor: '#34c759',
        borderRadius: 8,
        marginBottom: 8,
        backgroundColor: '#f0faf3',
    },
    inviteInfo: { flex: 1, marginRight: 12 },
    inviteGroupName: { fontSize: 15, fontWeight: '600' },
    inviteFrom: { fontSize: 13, color: '#888', marginTop: 2 },
    inviteActions: { flexDirection: 'row', gap: 8 },
    acceptButton: {
        backgroundColor: '#34c759',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 6,
    },
    acceptText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    declineButton: {
        borderWidth: 1,
        borderColor: '#ff3b30',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 6,
    },
    declineText: { color: '#ff3b30', fontWeight: 'bold', fontSize: 13 },
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
