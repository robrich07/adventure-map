import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity } from 'react-native';
import Mapbox, { Camera, UserLocation, UserLocationRenderMode } from '@rnmapbox/maps';
import { useLocation } from '../hooks/useLocation';
import { MAPBOX_TOKEN } from '../constants/map';
import { FogOverlay } from '../components/FogOverlay';
import { DebugTileGrid } from '../components/DebugTileGrid';
import { BoundingBox, TileId } from '../lib/tiles';
import '../tasks/locationTask';
import { useMasterPolygon } from '../hooks/useMasterPolygon';
import { getAllTilesFromSupabase } from '../lib/database';
import * as Location from 'expo-location';
import { LOCATION_TASK_NAME, LOCATION_UPDATE_INTERVAL_MS, LOCATION_DISTANCE_INTERVAL_M } from '../constants/map';
import { signOut } from '../lib/auth';
import { useAuth } from '../hooks/useAuth';

Mapbox.setAccessToken(MAPBOX_TOKEN);

export function MapScreen() {
  const { coords, loading, permissionGranted, error } = useLocation();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const masterPolygon = useMasterPolygon(userId ?? '');
  const [debugGrid, setDebugGrid] = useState(false);
  const [debugTiles, setDebugTiles] = useState<TileId[]>([]);
  const [zoomLevel, setZoomLevel] = useState(14);

  // Load tile list when debug mode is toggled on
  useEffect(() => {
    if (!debugGrid || !userId) {
      setDebugTiles([]);
      return;
    }
    (async () => {
      const tiles = await getAllTilesFromSupabase(userId);
      setDebugTiles(tiles);
    })();
  }, [debugGrid, userId]);

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

  const handleCameraChanged = useCallback((event: any) => {
    const zoom = event?.properties?.zoom;
    if (zoom != null) {
      setZoomLevel(Math.round(zoom * 10) / 10);
    }
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
        onCameraChanged={handleCameraChanged}
      >
        <Camera
          zoomLevel={14}
          centerCoordinate={[coords!.longitude, coords!.latitude]}
          animationMode="flyTo"
          animationDuration={800}
        />
        <UserLocation renderMode={UserLocationRenderMode.Native} />
        <FogOverlay
          masterPolygon={masterPolygon}
          visibleBounds={visibleBounds}
        />
        {debugGrid && <DebugTileGrid tiles={debugTiles} />}
      </Mapbox.MapView>
      <TouchableOpacity
            style={styles.debugButton}
            onPress={() => setDebugGrid(prev => !prev)}
        >
            <Text style={styles.debugText}>{debugGrid ? 'Hide Grid' : 'Show Grid'}</Text>
        </TouchableOpacity>
      {debugGrid && (
        <View style={styles.zoomBadge}>
          <Text style={styles.debugText}>z{zoomLevel}</Text>
        </View>
      )}
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
  debugButton: {
    position: 'absolute',
    top: 48,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  debugText: {
    color: '#00ff88',
    fontSize: 14,
  },
  zoomBadge: {
    position: 'absolute',
    top: 48,
    left: 130,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
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
