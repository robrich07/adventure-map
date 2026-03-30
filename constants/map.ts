export const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

// size of tiles in degrees
export const TILE_SIZE = 0.001;

// radius of visible circle centered in tiles
export const TILE_CIRCLE_RADIUS_KM = 0.08;

// Fog appearance
export const FOG_COLOR = 'rgba(25, 25, 35, 0.88)';

// World bounding box for fog polygon
export const WORLD_BOUNDS = {
    minLat: -85,
    maxLat: 85,
    minLng: -180,
    maxLng: 180,
};

// Background location updates
export const LOCATION_TASK_NAME = 'background-location-task';
export const LOCATION_UPDATE_INTERVAL_MS = 5000;
export const LOCATION_DISTANCE_INTERVAL_M = 10;

// length of invite codes for groups
export const INVITE_CODE_LENGTH = 6;

// How long a pending group tile stays around before it dies bc no one went
export const PENDING_TILE_EXPIRY_MS = 3 * 60 * 1000 // 3 minutos