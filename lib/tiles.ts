import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { TILE_SIZE, WORLD_BOUNDS, TILE_CIRCLE_RADIUS_KM } from "../constants/map";

export type TileId = {
    x: number;
    y: number;
};

export type LatLng = {
    latitude: number;
    longitude: number;
};

export type BoundingBox = {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
};

// Converts coords into a TileId
export function coordsToTile(lat: number, lng: number): TileId {
    return {
        x: Math.floor(lng / TILE_SIZE),
        y: Math.floor(lat / TILE_SIZE),
    };
}

// Returns unique key for tiles
export function tileKey(tile: TileId): string {
    return `${tile.x}_${tile.y}`;
}

// Filters list of tiles to only those within a bounding box, used for viewport culling
export function filterTilesInBounds(tiles: TileId[], bounds: BoundingBox): TileId[] {
    const minTileX = Math.floor(bounds.minLng / TILE_SIZE);
    const maxTileX = Math.floor(bounds.maxLng / TILE_SIZE);
    const minTileY = Math.floor(bounds.minLat / TILE_SIZE);
    const maxTileY = Math.floor(bounds.maxLat / TILE_SIZE);

    return tiles.filter(
        tile =>
            tile.x >= minTileX &&
            tile.x <= maxTileX &&
            tile.y >= minTileY &&
            tile.y <= maxTileY
    );
}

// Returns center coords of a tile in GeoJSON format
export function tileCenterCoords(tile: TileId): [number, number] {
    const lng = (tile.x + 0.5) * TILE_SIZE;
    const lat = (tile.y + 0.5) * TILE_SIZE;
    return [lng, lat];
}

// Creates circular GeoJSON polygon around tile center
// 32 steps produces smooth circle without too many verticies
export function tileToCircle(tile: TileId): Feature<Polygon> {
    const center = tileCenterCoords(tile);
    return turf.circle(center, TILE_CIRCLE_RADIUS_KM, { steps: 32 });
}

// Creates a square GeoJSON polygon matching the tile's grid cell boundaries
export function tileToSquare(tile: TileId): Feature<Polygon> {
    const minLng = tile.x * TILE_SIZE;
    const minLat = tile.y * TILE_SIZE;
    const maxLng = minLng + TILE_SIZE;
    const maxLat = minLat + TILE_SIZE;

    return turf.polygon([[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
    ]]);
}

// Unions a new circle into an existing master polygon.
// Simplifies the result to prevent vertex accumulation over time.
// Returns the circle itself if masterPolygon is null.
export function unionIntoMaster(
    masterPolygon: Feature<Polygon | MultiPolygon> | null,
    newCircle: Feature<Polygon>
): Feature<Polygon | MultiPolygon> {
    if (!masterPolygon) return newCircle;
    const result = turf.union(turf.featureCollection([masterPolygon, newCircle]));
    if (!result) return masterPolygon;
    return turf.simplify(result, { tolerance: 0.00005, highQuality: false });
}

// Clips the master polygon to the current viewport bounding box.
// Keeps the GeoJSON passed to Mapbox small regardless of total exploration area.
export function clipToViewport(
    masterPolygon: Feature<Polygon | MultiPolygon>,
    bounds: BoundingBox
): Feature<Polygon | MultiPolygon> | null {
    const bbox: [number, number, number, number] = [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat];

    if (masterPolygon.geometry.type === 'Polygon') {
        return turf.bboxClip(masterPolygon as Feature<Polygon>, bbox) as Feature<Polygon>;
    }

    // Flatten MultiPolygon into individual Polygons, clip each to viewport
    const polys = (masterPolygon.geometry as MultiPolygon).coordinates.map(
        (coords): Feature<Polygon> => turf.polygon(coords)
    );
    const clipped = polys
        .map(p => turf.bboxClip(p, bbox) as Feature<Polygon>)
        .filter(p => p.geometry.coordinates.length > 0);

    if (clipped.length === 0) return null;
    if (clipped.length === 1) return clipped[0];
    return (turf.union(turf.featureCollection(clipped)) as Feature<Polygon | MultiPolygon>) ?? null;
}

// Builds the fog GeoJSON polygon.
// Accepts a pre-computed, pre-clipped explored polygon as the hole.
// If exploredPolygon is null renders solid fog with no holes.
export function buildFogGeoJSON(
    exploredPolygon: Feature<Polygon | MultiPolygon> | null
) {
    const outerRing = [
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.minLat],
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.maxLat],
        [WORLD_BOUNDS.maxLng, WORLD_BOUNDS.maxLat],
        [WORLD_BOUNDS.maxLng, WORLD_BOUNDS.minLat],
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.minLat],
    ];

    if (!exploredPolygon) {
        return {
            type: 'Feature' as const,
            geometry: { type: 'Polygon' as const, coordinates: [outerRing] },
            properties: {},
        };
    }

    const holes =
        exploredPolygon.geometry.type === 'Polygon'
            ? exploredPolygon.geometry.coordinates
            : exploredPolygon.geometry.coordinates.flat();

    return {
        type: 'Feature' as const,
        geometry: {
            type: 'Polygon' as const,
            coordinates: [outerRing, ...holes],
        },
        properties: {},
    };
}