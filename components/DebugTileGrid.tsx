import { ShapeSource, LineLayer } from '@rnmapbox/maps';
import * as turf from '@turf/turf';
import type { Feature, Polygon, FeatureCollection } from 'geojson';
import { TileId, tileToSquare } from '../lib/tiles';

type Props = {
    tiles: TileId[];
};

// Renders explored tile boundaries as outlined squares for debugging
export function DebugTileGrid({ tiles }: Props) {
    if (tiles.length === 0) return null;

    const squares: Feature<Polygon>[] = tiles.map(tileToSquare);
    const collection: FeatureCollection = turf.featureCollection(squares);

    return (
        <ShapeSource id="debug-tile-grid" shape={collection}>
            <LineLayer
                id="debug-tile-outlines"
                style={{
                    lineColor: '#00ff88',
                    lineWidth: 1.5,
                    lineOpacity: 0.7,
                }}
            />
        </ShapeSource>
    );
}
