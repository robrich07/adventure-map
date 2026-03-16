import { useCallback, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import Mapbox, { Camera, UserLocation } from '@rnmapbox/maps';
import { useLocation } from './hooks/useLocation';
import { MAPBOX_TOKEN } from './constants/map';
import { FogOverlay } from './components/FogOverlay';
import { BoundingBox, TileId, coordsToTile } from './lib/tiles';

Mapbox.setAccessToken(MAPBOX_TOKEN);

// Hardcoded test coords, will remove once tile tracking is implemented
const TEST_TILES: TileId[] = [
  coordsToTile(40.7456, -74.0549), // original test tile
  coordsToTile(40.7460, -74.0549), // one tile north
  coordsToTile(40.7460, -74.0539), // northeast
  coordsToTile(40.7456, -74.0539), // one tile east
  coordsToTile(40.7450, -74.0549), // one tile south
  coordsToTile(40.7450, -74.0539), // southeast
  coordsToTile(40.7453, -74.0544), // middle cluster
  coordsToTile(40.7465, -74.0560), // further northwest
  coordsToTile(40.7470, -74.0555), // further north
  coordsToTile(40.7445, -74.0530), // further southeast
];

export default function App() {
  const { coords, loading, permissionGranted, error } = useLocation();

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
        <UserLocation visible={true} />
        <FogOverlay
          exploredTiles={TEST_TILES}
          visibleBounds={visibleBounds}
        />
      </Mapbox.MapView>
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
});
