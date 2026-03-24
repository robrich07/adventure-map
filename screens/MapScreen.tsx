import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity } from 'react-native';
import Mapbox, { Camera, UserLocation, UserLocationRenderMode } from '@rnmapbox/maps';
import { useLocation } from '../hooks/useLocation';
import { MAPBOX_TOKEN } from '../constants/map';
import { FogOverlay } from '../components/FogOverlay';
import { BoundingBox, TileId, coordsToTile } from '../lib/tiles';
import '../tasks/locationTask';
import { useTiles } from '../hooks/useTiles';
import * as Location from 'expo-location';
import { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL_MS, LOCATION_DISTANCE_INTERVAL_M } from '../constants/map';
import { signOut } from '../lib/auth';

Mapbox.setAccessToken(MAPBOX_TOKEN);

// Hardcoded test coords, will remove once tile tracking is implemented
// const TEST_TILES: TileId[] = [
//   coordsToTile(40.7456, -74.0549), // original test tile
//   coordsToTile(40.7460, -74.0549), // one tile north
//   coordsToTile(40.7460, -74.0539), // northeast
//   coordsToTile(40.7456, -74.0539), // one tile east
//   coordsToTile(40.7450, -74.0549), // one tile south
//   coordsToTile(40.7450, -74.0539), // southeast
//   coordsToTile(40.7453, -74.0544), // middle cluster
//   coordsToTile(40.7465, -74.0560), // further northwest
//   coordsToTile(40.7470, -74.0555), // further north
//   coordsToTile(40.7445, -74.0530), // further southeast
// ];

export function MapScreen() {
  const { coords, loading, permissionGranted, error } = useLocation();
  const exploredTiles = useTiles();

  const [visibleBounds, setVisibleBounds] = useState<BoundingBox>({
    minLat: -85,
    maxLat: 85,
    minLng: -180,
    maxLng: 180,
  });

  const handleRegionChange = useCallback((region: any) => {
    const bounds = region?.properties?.visibleBounds;
    if (!bounds) return;
    const [[maxLng, maxLat], [minLng, minLat]] = bounds;
    setVisibleBounds({ minLat, maxLat, minLng, maxLng });
  }, []);

  useEffect(() => {
    if (!permissionGranted) return;

    (async () => {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Background location permission denied');
        return;
      }

      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);

      if (!isRunning) {
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.message}>Finding your location...</Text>
      </View>
    );
  }

  if (!permissionGranted || error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>
          {error ?? 'Location permission is required to use this app.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL={Mapbox.StyleURL.Dark}
        onMapIdle={handleRegionChange}
      >
        <Camera
          zoomLevel={14}
          centerCoordinate={[coords!.longitude, coords!.latitude]}
          animationMode="flyTo"
          animationDuration={800}
        />
        <UserLocation renderMode={UserLocationRenderMode.Native} />
        <FogOverlay
          exploredTiles={exploredTiles}
          visibleBounds={visibleBounds}
        />
      </Mapbox.MapView>
      <TouchableOpacity
            style={styles.signOutButton}
            onPress={signOut}
        >
            <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
    </View>
    
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    color: '#444',
  },
  signOutButton: {
    position: 'absolute',
    top: 48,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 14,
    },
});
