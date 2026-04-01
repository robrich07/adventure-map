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

// Returns which of a tile's 8 neighbors (cardinal + diagonal) exist in the tile set
export function getNeighborTiles(tile: TileId, tileSet: Set<string>): TileId[] {
    const directions = [
        { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
        { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
    ];
    const neighbors: TileId[] = [];
    for (const d of directions) {
        const neighbor = { x: tile.x + d.x, y: tile.y + d.y };
        if (tileSet.has(tileKey(neighbor))) {
            neighbors.push(neighbor);
        }
    }
    return neighbors;
}

// Builds a rectangular connector polygon between two adjacent tile centers.
// Width matches the full circle diameter so the result is a stadium/capsule shape.
// Applies latitude correction so the perpendicular offset is accurate at non-equator latitudes.
export function buildConnector(tileA: TileId, tileB: TileId): Feature<Polygon> | null {
    const centerA = tileCenterCoords(tileA);
    const centerB = tileCenterCoords(tileB);

    const dLng = centerB[0] - centerA[0];
    const dLat = centerB[1] - centerA[1];
    if (dLng === 0 && dLat === 0) return null;

    // Latitude correction: 1° lng is shorter than 1° lat away from equator
    const midLat = (centerA[1] + centerB[1]) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);

    // Normalize direction in meter-space
    const dxMeters = dLng * cosLat;
    const dyMeters = dLat;
    const len = Math.sqrt(dxMeters * dxMeters + dyMeters * dyMeters);

    // Perpendicular unit vector in meter-space, then convert back to degrees
    const perpLng = (-dyMeters / len) / cosLat;
    const perpLat = (dxMeters / len);

    // Half-width in degrees 
    // TILE_CIRCLE_RADIUS_KM is in km, convert to degrees (1° lat ≈ 111.32 km)
    const halfWidthDeg = (TILE_CIRCLE_RADIUS_KM / 111.32) * 1.00;

    const offLng = perpLng * halfWidthDeg;
    const offLat = perpLat * halfWidthDeg;

    return turf.polygon([[
        [centerA[0] + offLng, centerA[1] + offLat],
        [centerB[0] + offLng, centerB[1] + offLat],
        [centerB[0] - offLng, centerB[1] - offLat],
        [centerA[0] - offLng, centerA[1] - offLat],
        [centerA[0] + offLng, centerA[1] + offLat],
    ]]);
}

// Unions a new circle + its connectors to neighbors into the master polygon.
// Returns the circle itself (with connectors) if masterPolygon is null.
// Falls back gracefully if turf.union fails on complex geometry:
//   1. Try circle + connectors + master (full)
//   2. Try circle + master only (skip connectors)
//   3. Return master unchanged (skip tile entirely)
export function unionIntoMaster(
    masterPolygon: Feature<Polygon | MultiPolygon> | null,
    newCircle: Feature<Polygon>,
    newTile: TileId,
    tileSet: Set<string>
): Feature<Polygon | MultiPolygon> {
    console.log(`[Polygon] unionIntoMaster tile=${newTile.x},${newTile.y} tileSetSize=${tileSet.size} hasMaster=${!!masterPolygon}`);

    // Build connectors to all existing neighbors
    const neighbors = getNeighborTiles(newTile, tileSet);
    const connectors = neighbors
        .map(n => buildConnector(newTile, n))
        .filter((c): c is Feature<Polygon> => c !== null);

    console.log(`[Polygon] neighbors=${neighbors.length} connectors=${connectors.length}`);

    // Check the circle is valid
    const circleCoords = newCircle.geometry.coordinates[0]?.length ?? 0;
    console.log(`[Polygon] circle vertices=${circleCoords} type=${newCircle.geometry.type}`);

    // Union circle + connectors into a local shape first
    let local: Feature<Polygon | MultiPolygon> = newCircle;
    if (connectors.length > 0) {
        try {
            const localResult = turf.union(turf.featureCollection([newCircle, ...connectors]));
            if (localResult) {
                console.log(`[Polygon] local union OK type=${localResult.geometry.type}`);
                local = localResult;
            } else {
                console.warn('[Polygon] local union returned null');
            }
        } catch (e) {
            console.warn('[Polygon] local union failed, using circle only:', e);
            local = newCircle;
        }
    }

    if (!masterPolygon) {
        console.log(`[Polygon] no master, returning local type=${local.geometry.type}`);
        return local;
    }

    const masterType = masterPolygon.geometry.type;
    const masterCoordCount = masterType === 'Polygon'
        ? masterPolygon.geometry.coordinates[0]?.length ?? 0
        : (masterPolygon.geometry as MultiPolygon).coordinates.length;
    console.log(`[Polygon] master type=${masterType} coordCount=${masterCoordCount}`);

    try {
        const result = turf.union(turf.featureCollection([masterPolygon, local]));
        if (!result) {
            console.warn('[Polygon] master union returned null');
            return masterPolygon;
        }
        console.log(`[Polygon] master union OK type=${result.geometry.type}`);
        return result;
    } catch (e) {
        console.warn('[Polygon] master union failed, retrying circle only:', e);
        try {
            const result = turf.union(turf.featureCollection([masterPolygon, newCircle]));
            if (!result) return masterPolygon;
            console.log(`[Polygon] circle-only fallback OK type=${result.geometry.type}`);
            return result;
        } catch (e2) {
            console.error('[Polygon] circle-only union also failed, skipping tile:', e2);
            return masterPolygon;
        }
    }
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
    try {
        return (turf.union(turf.featureCollection(clipped)) as Feature<Polygon | MultiPolygon>) ?? null;
    } catch (e) {
        // Union of clipped fragments failed — return the largest piece
        console.warn('[Polygon] clipToViewport union failed, returning first fragment:', e);
        return clipped[0];
    }
}

// Builds the fog GeoJSON by subtracting the explored polygon from a world-covering rectangle.
// Uses turf.difference which correctly handles rings (unexplored centers stay fogged).
// May return a MultiPolygon when there are disconnected explored areas.
export function buildFogGeoJSON(
    exploredPolygon: Feature<Polygon | MultiPolygon> | null
): Feature<Polygon | MultiPolygon> {
    const fogPoly = turf.polygon([[
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.minLat],
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.maxLat],
        [WORLD_BOUNDS.maxLng, WORLD_BOUNDS.maxLat],
        [WORLD_BOUNDS.maxLng, WORLD_BOUNDS.minLat],
        [WORLD_BOUNDS.minLng, WORLD_BOUNDS.minLat],
    ]]);

    if (!exploredPolygon) return fogPoly;
    try {
        const result = turf.difference(turf.featureCollection([fogPoly, exploredPolygon]));
        return result ?? fogPoly;
    } catch (e) {
        // turf.difference can fail on self-intersecting geometry — fall back to solid fog
        console.error('[Polygon] buildFogGeoJSON difference failed:', e);
        return fogPoly;
    }
}