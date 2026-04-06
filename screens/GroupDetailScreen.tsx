import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useGroupMembers } from '../hooks/useGroupMembers';
import { leaveGroup, searchUsers, sendGroupInvite, Group } from '../lib/groups';
import { getFriends } from '../lib/friends';

type Props = {
    group: Group;
    onBack: () => void;
    onViewGroupMap?: (group: Group) => void;
};

type SearchResult = { id: string; username: string; email: string };

export function GroupDetailScreen({ group, onBack, onViewGroupMap }: Props) {
    const { session } = useAuth();
    const userId = session?.user?.id ?? '';
    const { members, loading } = useGroupMembers(group.id);

    const [showInvite, setShowInvite] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [inviteMessage, setInviteMessage] = useState<{ text: string; isError: boolean } | null>(null);
    const [friendIds, setFriendIds] = useState<Set<string>>(new Set());

    // Load friends list when invite mode opens so we can filter results
    const loadFriends = async () => {
        const friends = await getFriends(userId);
        setFriendIds(new Set(friends.map(f => f.id)));
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        setInviteMessage(null);
        if (query.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        setSearching(true);
        const results = await searchUsers(query.trim(), userId);
        // Filter to only friends who are not already members
        const memberIds = new Set(members.map(m => m.user_id));
        setSearchResults(results.filter(r => friendIds.has(r.id) && !memberIds.has(r.id)));
        setSearching(false);
    };

    const handleInvite = async (user: SearchResult) => {
        setInviteMessage(null);
        const { error } = await sendGroupInvite(group.id, user.id, userId);
        if (error) {
            setInviteMessage({ text: error, isError: true });
        } else {
            setInviteMessage({ text: `Invited ${user.username}!`, isError: false });
            // Remove from search results
            setSearchResults(prev => prev.filter(r => r.id !== user.id));
        }
    };

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
                    style={styles.memberList}
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

            <TouchableOpacity
                style={styles.inviteToggle}
                onPress={() => {
                    const opening = !showInvite;
                    setShowInvite(opening);
                    setSearchQuery('');
                    setSearchResults([]);
                    setInviteMessage(null);
                    if (opening) loadFriends();
                }}
            >
                <Text style={styles.inviteToggleText}>
                    {showInvite ? 'Cancel Invite' : 'Invite User'}
                </Text>
            </TouchableOpacity>

            {showInvite && (
                <View style={styles.inviteSection}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by username..."
                        value={searchQuery}
                        onChangeText={handleSearch}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {searching && <ActivityIndicator style={styles.searchSpinner} />}
                    {inviteMessage && (
                        <Text style={[styles.message, inviteMessage.isError && styles.errorMessage]}>
                            {inviteMessage.text}
                        </Text>
                    )}
                    {searchResults.map(user => (
                        <TouchableOpacity
                            key={user.id}
                            style={styles.searchResult}
                            onPress={() => handleInvite(user)}
                        >
                            <View>
                                <Text style={styles.resultName}>{user.username}</Text>
                                <Text style={styles.resultEmail}>{user.email}</Text>
                            </View>
                            <Text style={styles.inviteAction}>Invite</Text>
                        </TouchableOpacity>
                    ))}
                    {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                        <Text style={styles.noResults}>No users found</Text>
                    )}
                </View>
            )}

            {onViewGroupMap && (
                <TouchableOpacity style={styles.mapButton} onPress={() => { console.log('[Groups] opening group map for:', group.name); onViewGroupMap(group); }}>
                    <Text style={styles.mapButtonText}>View Group Map</Text>
                </TouchableOpacity>
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
    memberList: { maxHeight: 200 },
    memberItem: {
        padding: 12,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        marginBottom: 8,
    },
    memberName: { fontSize: 15, fontWeight: '500' },
    memberEmail: { fontSize: 13, color: '#888', marginTop: 2 },
    inviteToggle: {
        marginTop: 16,
        padding: 14,
        borderRadius: 8,
        backgroundColor: '#34c759',
        alignItems: 'center',
    },
    inviteToggleText: { color: '#fff', fontWeight: 'bold' },
    inviteSection: { marginTop: 12 },
    searchInput: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
    searchSpinner: { marginTop: 8 },
    message: { marginTop: 8, color: '#34c759', textAlign: 'center' },
    errorMessage: { color: '#ff3b30' },
    searchResult: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        marginTop: 8,
    },
    resultName: { fontSize: 15, fontWeight: '500' },
    resultEmail: { fontSize: 13, color: '#888', marginTop: 2 },
    inviteAction: { color: '#3a86ff', fontWeight: 'bold', fontSize: 15 },
    noResults: { marginTop: 12, color: '#888', textAlign: 'center' },
    mapButton: {
        marginTop: 12,
        padding: 14,
        borderRadius: 8,
        backgroundColor: '#3a86ff',
        alignItems: 'center',
    },
    mapButtonText: { color: '#fff', fontWeight: 'bold' },
    leaveButton: {
        marginTop: 12,
        padding: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ff3b30',
        alignItems: 'center',
    },
    leaveText: { color: '#ff3b30', fontWeight: 'bold' },
});
