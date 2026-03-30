import { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from './hooks/useAuth';
import { useLocation } from './hooks/useLocation';
import { MapScreen } from './screens/MapScreen';
import { LoginScreen } from './screens/LoginScreen';
import { LoadingScreen } from './screens/LoadingScreen';
import { GroupsScreen } from './screens/GroupsScreen';
import { Group } from './lib/groups';
import { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL_MS, LOCATION_DISTANCE_INTERVAL_M } from './constants/map';
import './tasks/locationTask';

export default function App() {
  const { session, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'map' | 'groups'>('map');
  const [viewingGroup, setViewingGroup] = useState<Group | null>(null);
  const isAuthenticated = !loading && !!session;
  const { coords, loading: locationLoading, permissionGranted, error: locationError } = useLocation(isAuthenticated);

  // Start background location tracking as soon as foreground permission is granted
  useEffect(() => {
    if (!permissionGranted) return;

    (async () => {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[App] background location permission denied');
        return;
      }

      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
      console.log('[App] background location running:', isRunning);

      if (!isRunning) {
        console.log('[App] starting background location updates');
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: LOCATION_UPDATE_INTERVAL_MS,
          distanceInterval: LOCATION_DISTANCE_INTERVAL_M,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Adventure Map',
            notificationBody: 'Recording your exploration.',
            notificationColor: '#191923'
          },
        });
      }
    })();
  }, [permissionGranted]);

  if (loading) return <LoadingScreen />;
  if (!session) return <LoginScreen />;

  // When viewing a group map, show MapScreen fullscreen with no tab bar
  if (viewingGroup) {
    return (
      <MapScreen
        coords={coords}
        locationLoading={locationLoading}
        permissionGranted={permissionGranted}
        locationError={locationError}
        groupOverride={viewingGroup}
        onBackFromGroup={() => setViewingGroup(null)}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {activeTab === 'map' ? (
        <MapScreen
          coords={coords}
          locationLoading={locationLoading}
          permissionGranted={permissionGranted}
          locationError={locationError}
        />
      ) : (
        <GroupsScreen onViewGroupMap={(group) => { console.log('[Nav] viewing group map:', group.name); setViewingGroup(group); }} />
      )}
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
