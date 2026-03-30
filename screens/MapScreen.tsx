import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity } from 'react-native';
import Mapbox, { Camera, UserLocation, UserLocationRenderMode } from '@rnmapbox/maps';
import { MAPBOX_TOKEN } from '../constants/map';
import { FogOverlay } from '../components/FogOverlay';
import { DebugTileGrid } from '../components/DebugTileGrid';
import { BoundingBox, TileId } from '../lib/tiles';
import { useMasterPolygon } from '../hooks/useMasterPolygon';
import { useGroupMasterPolygon } from '../hooks/useGroupMasterPolygon';
import { getAllTilesFromSupabase } from '../lib/database';
import { signOut } from '../lib/auth';
import { useAuth } from '../hooks/useAuth';
import { Group } from '../lib/groups';
import type { LocationObjectCoords } from 'expo-location';

Mapbox.setAccessToken(MAPBOX_TOKEN);

type Props = {
  coords: LocationObjectCoords | null;
  locationLoading: boolean;
  permissionGranted: boolean;
  locationError: string | null;
  groupOverride?: Group | null;
  onBackFromGroup?: () => void;
};

export function MapScreen({ coords, locationLoading, permissionGranted, locationError, groupOverride, onBackFromGroup }: Props) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const personalPolygon = useMasterPolygon(userId ?? '');
  const groupPolygon = useGroupMasterPolygon(
    groupOverride?.id ?? '',
    userId ?? ''
  );

  // Use group polygon when viewing a group, otherwise personal
  const masterPolygon = groupOverride ? groupPolygon : personalPolygon;
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
    setVisibleBounds(prev => {
      if (prev.minLat === minLat && prev.maxLat === maxLat &&
          prev.minLng === minLng && prev.maxLng === maxLng) return prev;
      return { minLat, maxLat, minLng, maxLng };
    });
  }, []);

  const handleCameraChanged = useCallback((event: any) => {
    const zoom = event?.properties?.zoom;
    if (zoom != null) {
      const rounded = Math.round(zoom * 10) / 10;
      setZoomLevel(prev => prev === rounded ? prev : rounded);
    }
  }, []);

  if (locationLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.message}>Finding your location...</Text>
      </View>
    );
  }

  if (!permissionGranted || locationError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>
          {locationError ?? 'Location permission is required to use this app.'}
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
      {groupOverride && onBackFromGroup ? (
        <TouchableOpacity style={styles.groupBackButton} onPress={onBackFromGroup}>
          <Text style={styles.groupBackText}>← {groupOverride.name}</Text>
        </TouchableOpacity>
      ) : (
        <>
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
        </>
      )}
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
  groupBackButton: {
    position: 'absolute',
    top: 48,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  groupBackText: {
    color: '#fff',
    fontSize: 14,
  },
});
