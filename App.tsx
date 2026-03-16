import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import Mapbox, { Camera, UserLocation } from '@rnmapbox/maps';
import { useLocation } from './hooks/useLocation';
import { MAPBOX_TOKEN } from './constants/map';

Mapbox.setAccessToken(MAPBOX_TOKEN);

export default function App() {
  const { coords, loading, permissionGranted, error } = useLocation();

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
      <Mapbox.MapView style={styles.map} styleURL={Mapbox.StyleURL.Dark}>
        <Camera
          zoomLevel={14}
          centerCoordinate={[coords!.longitude, coords!.latitude]}
          animationMode="flyTo"
          animationDuration={800}
        />
        <UserLocation visible={true} />
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
