import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

type LocationState = {
    coords: Location.LocationObjectCoords | null;
    permissionGranted: boolean;
    loading: boolean;
    error: string | null;
};

export function useLocation(): LocationState {
    const [state, setState] = useState<LocationState>({
        coords: null,
        permissionGranted: false,
        loading: true,
        error: null,
    });

    useEffect(() => {
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
        
            const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Low,
            }).catch(async () => {
                return await Location.getLastKnownPositionAsync();
            });

            if (!location) {
                setState(s => ({
                    ...s,
                    loading: false,
                    permissionGranted: true,
                    error: 'Could not determine location.',
                }));
                return;
            }

            setState({
                coords: location.coords,
                permissionGranted: true,
                loading: false,
                error: null,
            });
        })();
    }, []);

    return state;
}