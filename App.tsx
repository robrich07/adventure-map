import { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useAuth } from './hooks/useAuth';
import { MapScreen } from './screens/MapScreen';
import { LoginScreen } from './screens/LoginScreen';
import { LoadingScreen } from './screens/LoadingScreen';
import { GroupsScreen } from './screens/GroupsScreen';

export default function App() {
  const { session, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'map' | 'groups'>('map');

  if (loading) return <LoadingScreen />;
  if (!session) return <LoginScreen />;

  return (
    <View style={{ flex: 1 }}>
      {activeTab === 'map' ? <MapScreen /> : <GroupsScreen />}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'map' && styles.activeTab]}
          onPress={() => { console.log('[Nav] switched to Map'); setActiveTab('map'); }}
        >
          <Text style={styles.tabText}>Map</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'groups' && styles.activeTab]}
          onPress={() => { console.log('[Nav] switched to Groups'); setActiveTab('groups'); }}
        >
          <Text style={styles.tabText}>Groups</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
  },
  activeTab: {
    borderTopWidth: 2,
    borderTopColor: '#3a86ff',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
