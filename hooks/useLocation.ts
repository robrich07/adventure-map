import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

type LocationState = {
    coords: Location.LocationObjectCoords | null;
    permissionGranted: boolean;
    loading: boolean;
    error: string | null;
};

// Watches the device location continuously so coords stay fresh across all screens.
// Also keeps a foreground location subscription active, which ensures the Android
// emulator keeps delivering mock route updates to the background location task.
export function useLocation(enabled: boolean = true): LocationState {
    const [state, setState] = useState<LocationState>({
        coords: null,
        permissionGranted: false,
        loading: true,
        error: null,
    });

    useEffect(() => {
        if (!enabled) return;

        let subscription: Location.LocationSubscription | null = null;

        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();

            if (status !== 'granted') {
                setState(s => ({
                    ...s,
                    loading: false,
                    permissionGranted: false,
                    error: 'Location permission was denied.',
                }));
                return;
            }

            // Get initial position so the map can center immediately
            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            }).catch(async () => {
                return await Location.getLastKnownPositionAsync();
            });

            if (location) {
                setState({
                    coords: location.coords,
                    permissionGranted: true,
                    loading: false,
                    error: null,
                });
            } else {
                setState(s => ({
                    ...s,
                    loading: false,
                    permissionGranted: true,
                }));
            }

            // Subscribe to continuous updates so coords stay current
            subscription = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
                (loc) => {
                    setState(s => ({
                        ...s,
                        coords: loc.coords,
                        permissionGranted: true,
                        loading: false,
                    }));
                }
            );
        })();

        return () => {
            subscription?.remove();
        };
    }, [enabled]);

    return state;
}