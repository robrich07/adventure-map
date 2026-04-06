import { useState, useEffect } from 'react';
import {
    View, Text, FlatList, TouchableOpacity, TextInput,
    StyleSheet, ActivityIndicator, Switch, Alert,
} from 'react-native';
import { useFriends } from '../hooks/useFriends';
import { useFriendRequests } from '../hooks/useFriendRequests';
import {
    searchPublicUsers, sendFriendRequest, acceptFriendRequest,
    declineFriendRequest, removeFriend, getProfileVisibility,
    setProfileVisibility, FriendProfile,
} from '../lib/friends';

type Props = {
    userId: string;
};

export function FriendsScreen({ userId }: Props) {
    const { friends, loading, refresh: refreshFriends } = useFriends(userId);
    const { requests, loading: requestsLoading, refresh: refreshRequests } = useFriendRequests(userId);

    const [isPublic, setIsPublic] = useState(true);
    const [visibilityLoading, setVisibilityLoading] = useState(true);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
    const [searching, setSearching] = useState(false);
    const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Load initial visibility setting
    useEffect(() => {
        const loadVisibility = async () => {
            const visible = await getProfileVisibility(userId);
            setIsPublic(visible);
            setVisibilityLoading(false);
        };
        loadVisibility();
    }, [userId]);

    const handleToggleVisibility = async (value: boolean) => {
        if (!value) {
            // Warn before going private — will remove all friendships
            Alert.alert(
                'Make Profile Private?',
                'This will remove all your friends and pending requests. You won\'t be searchable.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Go Private',
                        style: 'destructive',
                        onPress: async () => {
                            setIsPublic(false);
                            const { error } = await setProfileVisibility(userId, false);
                            if (error) {
                                setIsPublic(true);
                                setError(error);
                                return;
                            }
                            refreshFriends();
                            refreshRequests();
                        },
                    },
                ]
            );
            return;
        }

        setIsPublic(true);
        const { error } = await setProfileVisibility(userId, true);
        if (error) {
            setIsPublic(false);
            setError(error);
        }
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        setMessage(null);

        if (query.trim().length < 2) {
            setSearchResults([]);
            return;
        }

        setSearching(true);
        const results = await searchPublicUsers(query.trim(), userId);
        // Filter out users who are already friends
        const friendIds = new Set(friends.map(f => f.id));
        setSearchResults(results.filter(r => !friendIds.has(r.id)));
        setSearching(false);
    };

    const handleSendRequest = async (addresseeId: string) => {
        setMessage(null);
        const { error } = await sendFriendRequest(userId, addresseeId);
        if (error) {
            setMessage({ text: error, isError: true });
            return;
        }
        setMessage({ text: 'Friend request sent!', isError: false });
        // Remove from search results
        setSearchResults(prev => prev.filter(r => r.id !== addresseeId));
    };

    const handleAccept = async (friendshipId: string) => {
        const { error } = await acceptFriendRequest(friendshipId);
        if (error) {
            setError(error);
            return;
        }
        refreshRequests();
        refreshFriends();
    };

    const handleDecline = async (friendshipId: string) => {
        const { error } = await declineFriendRequest(friendshipId);
        if (error) {
            setError(error);
            return;
        }
        refreshRequests();
    };

    const handleRemove = (friendshipId: string, username: string) => {
        Alert.alert(
            'Remove Friend',
            `Are you sure you want to remove ${username}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        const { error } = await removeFriend(friendshipId);
                        if (error) {
                            setError(error);
                            return;
                        }
                        refreshFriends();
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Friends</Text>
                {!visibilityLoading && (
                    <View style={styles.visibilityToggle}>
                        <Text style={styles.visibilityLabel}>
                            {isPublic ? 'Public' : 'Private'}
                        </Text>
                        <Switch
                            value={isPublic}
                            onValueChange={handleToggleVisibility}
                            trackColor={{ false: '#ccc', true: '#34c759' }}
                        />
                    </View>
                )}
            </View>

            {!isPublic && (
                <View style={styles.privateNotice}>
                    <Text style={styles.privateNoticeText}>
                        Your profile is private. Switch to public to add friends.
                    </Text>
                </View>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            {/* Pending friend requests */}
            {isPublic && !requestsLoading && requests.length > 0 && (
                <View style={styles.requestsSection}>
                    <Text style={styles.sectionTitle}>Friend Requests</Text>
                    {requests.map(request => (
                        <View key={request.id} style={styles.requestItem}>
                            <View style={styles.requestInfo}>
                                <Text style={styles.requestUsername}>
                                    {request.requester?.username ?? 'Unknown'}
                                </Text>
                                <Text style={styles.requestEmail}>
                                    {request.requester?.email ?? ''}
                                </Text>
                            </View>
                            <View style={styles.requestActions}>
                                <TouchableOpacity
                                    style={styles.acceptButton}
                                    onPress={() => handleAccept(request.id)}
                                >
                                    <Text style={styles.acceptText}>Accept</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.declineButton}
                                    onPress={() => handleDecline(request.id)}
                                >
                                    <Text style={styles.declineText}>Decline</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* Friends list */}
            {loading ? (
                <ActivityIndicator />
            ) : (
                <FlatList
                    data={friends}
                    keyExtractor={item => item.id}
                    renderItem={({ item }) => (
                        <View style={styles.friendItem}>
                            <View style={styles.friendInfo}>
                                <Text style={styles.friendUsername}>{item.username}</Text>
                                <Text style={styles.friendEmail}>{item.email}</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.removeButton}
                                onPress={() => handleRemove(item.friendshipId, item.username)}
                            >
                                <Text style={styles.removeText}>Remove</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    ListEmptyComponent={
                        isPublic ? (
                            <Text style={styles.empty}>
                                No friends yet. Search for users to add!
                            </Text>
                        ) : null
                    }
                />
            )}

            {/* Search UI */}
            {isPublic && showSearch && (
                <View style={styles.searchSection}>
                    <TextInput
                        style={styles.input}
                        placeholder="Search by username..."
                        value={searchQuery}
                        onChangeText={handleSearch}
                        autoCapitalize="none"
                    />
                    {searching && <ActivityIndicator style={{ marginVertical: 8 }} />}
                    {message && (
                        <Text style={[styles.message, { color: message.isError ? '#ff3b30' : '#34c759' }]}>
                            {message.text}
                        </Text>
                    )}
                    {!searching && searchResults.length > 0 && (
                        <FlatList
                            data={searchResults}
                            keyExtractor={item => item.id}
                            style={styles.searchResults}
                            renderItem={({ item }) => (
                                <View style={styles.searchResultItem}>
                                    <View style={styles.searchResultInfo}>
                                        <Text style={styles.searchResultUsername}>{item.username}</Text>
                                        <Text style={styles.searchResultEmail}>{item.email}</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.addButton}
                                        onPress={() => handleSendRequest(item.id)}
                                    >
                                        <Text style={styles.addButtonText}>Add</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    )}
                    {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                        <Text style={styles.noResults}>No users found.</Text>
                    )}
                </View>
            )}

            {/* Add Friend button */}
            {isPublic && (
                <View style={styles.actions}>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={() => {
                            setShowSearch(!showSearch);
                            setSearchQuery('');
                            setSearchResults([]);
                            setMessage(null);
                            setError(null);
                        }}
                    >
                        <Text style={styles.buttonText}>
                            {showSearch ? 'Cancel' : 'Add Friend'}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16, paddingTop: 48 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: { fontSize: 24, fontWeight: 'bold' },
    visibilityToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    visibilityLabel: { fontSize: 14, color: '#888' },
    privateNotice: {
        backgroundColor: '#fff3cd',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    privateNoticeText: { color: '#856404', fontSize: 14, textAlign: 'center' },
    error: { color: 'red', textAlign: 'center', marginVertical: 8 },
    requestsSection: { marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
    requestItem: {
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
    requestInfo: { flex: 1, marginRight: 12 },
    requestUsername: { fontSize: 15, fontWeight: '600' },
    requestEmail: { fontSize: 13, color: '#888', marginTop: 2 },
    requestActions: { flexDirection: 'row', gap: 8 },
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
    friendItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 14,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        marginBottom: 10,
    },
    friendInfo: { flex: 1, marginRight: 12 },
    friendUsername: { fontSize: 16, fontWeight: '600' },
    friendEmail: { fontSize: 13, color: '#888', marginTop: 4 },
    removeButton: {
        borderWidth: 1,
        borderColor: '#ff3b30',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 6,
    },
    removeText: { color: '#ff3b30', fontWeight: 'bold', fontSize: 13 },
    empty: { textAlign: 'center', color: '#888', marginTop: 40 },
    searchSection: { marginVertical: 12 },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
    message: { textAlign: 'center', marginVertical: 8, fontSize: 14 },
    searchResults: { maxHeight: 200, marginTop: 8 },
    searchResultItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        marginBottom: 8,
    },
    searchResultInfo: { flex: 1, marginRight: 12 },
    searchResultUsername: { fontSize: 15, fontWeight: '600' },
    searchResultEmail: { fontSize: 13, color: '#888', marginTop: 2 },
    addButton: {
        backgroundColor: '#3a86ff',
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 6,
    },
    addButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
    noResults: { textAlign: 'center', color: '#888', marginTop: 12 },
    actions: { marginTop: 12 },
    button: {
        backgroundColor: '#3a86ff',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
        minHeight: 50,
        justifyContent: 'center',
    },
    buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
