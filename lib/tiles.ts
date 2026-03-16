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

// Builds GEOJSON polygon for fog overlay, outer ring is whole world then each other ring is a hole for explored tiles
export function buildFogGeoJSON(visibleExploredTiles: TileId[]) {
    const outerRing = [
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.minLat],
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.maxLat],
        [WORLD_BOUNDS.maxLng, WORLD_BOUNDS.maxLat],
        [WORLD_BOUNDS.maxLng, WORLD_BOUNDS.minLat],
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.minLat],
    ];

    if (visibleExploredTiles.length === 0) {
        return {
            type: 'Feature' as const,
            geometry: {
                type: 'Polygon' as const,
                coordinates: [outerRing],
            },
            properties: {},
        };
    }
    
    // create circle for each tile then union them
    const circles = visibleExploredTiles.map(tileToCircle);
    const merged = circles.length === 1
    ? circles[0]
    : turf.union(turf.featureCollection(circles))!;

    // Extract coordinate rings from merged shape to use as holes in the fog
    const holes =
        merged.geometry.type === 'Polygon'
            ? merged.geometry.coordinates
            : merged.geometry.coordinates.flat();

    return {
        type: 'Feature' as const,
        geometry: {
            type: 'Polygon' as const,
            coordinates: [outerRing, ...holes],
        },
        properties: {},
    };
}