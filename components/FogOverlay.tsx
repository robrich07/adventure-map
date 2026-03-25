import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { ShapeSource, FillLayer } from '@rnmapbox/maps';
import { FOG_COLOR } from '../constants/map';
import { BoundingBox, clipToViewport, buildFogGeoJSON } from '../lib/tiles';

type Props = {
    masterPolygon: Feature<Polygon | MultiPolygon> | null;
    visibleBounds: BoundingBox;
};

// Renders fog overlay. Clips master polygon to viewport before rendering
// so Mapbox only processes the visible explored area.
export function FogOverlay({ masterPolygon, visibleBounds }: Props) {
    const clipped = masterPolygon
        ? clipToViewport(masterPolygon, visibleBounds)
        : null;

    const fogGeoJSON = buildFogGeoJSON(clipped);

    return (
        <ShapeSource id="fog-source" shape={fogGeoJSON}>
            <FillLayer
                id="fog-layer"
                style={{
                    fillColor: FOG_COLOR,
                    fillOpacity: 1,
                }}
            />
        </ShapeSource>
    );
}
