import { TILE_SIZE, WORLD_BOUNDS } from "../constants/map";

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

// Converts a TileId into 4 corner coords of that tile as a closed GEOJSON ring
// GEOJSON uses [Lng, Lat] ordering
export function tileToGeoJSONRing(tile: TileId): number[][] {
    const minLng = tile.x * TILE_SIZE;
    const maxLng = (tile.x + 1) * TILE_SIZE;
    const minLat = tile.y * TILE_SIZE;
    const maxLat = (tile.y + 1) * TILE_SIZE;

    return [
        [minLng, minLat],
        [minLng, maxLat],
        [maxLng, maxLat],
        [maxLng, minLat],
        [minLng, minLat], // close the ring (same as first coord)
    ];
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

// Builds GEOJSON polygon for fog overlay, outer ring is whole world then each other ring is a hole for explored tiles
export function buildFogGeoJSON(visibleExploredTiles: TileId[]) {
    const outerRing = [
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.minLat],
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.maxLat],
        [WORLD_BOUNDS.maxLng, WORLD_BOUNDS.maxLat],
        [WORLD_BOUNDS.maxLng, WORLD_BOUNDS.minLat],
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.minLat],
    ];

    const holes = visibleExploredTiles.map(tileToGeoJSONRing);

    return {
        type: 'Feature' as const,
        geometry: {
            type: 'Polygon' as const,
            coordinates: [outerRing, ...holes],
        },
        properties: {},
    };

}