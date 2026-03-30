import { useMemo, useRef } from 'react';
import type { Feature, Polygon, MultiPolygon } from 'geojson';
import { ShapeSource, FillLayer } from '@rnmapbox/maps';
import { FOG_COLOR } from '../constants/map';
import { BoundingBox, clipToViewport, buildFogGeoJSON } from '../lib/tiles';

type Props = {
    masterPolygon: Feature<Polygon | MultiPolygon> | null;
    visibleBounds: BoundingBox;
    sourceId?: string;
};

// Renders fog overlay. Clips master polygon to viewport before rendering
// so Mapbox only processes the visible explored area.
// Memoizes the GeoJSON to prevent unnecessary ShapeSource updates.
export function FogOverlay({ masterPolygon, visibleBounds, sourceId = 'fog-source' }: Props) {
    const lastJsonRef = useRef<string>('');
    const lastGeoJSONRef = useRef<ReturnType<typeof buildFogGeoJSON> | null>(null);

    const fogGeoJSON = useMemo(() => {
        const clipped = masterPolygon
            ? clipToViewport(masterPolygon, visibleBounds)
            : null;

        const geoJSON = buildFogGeoJSON(clipped);
        const json = JSON.stringify(geoJSON);

        // Return the same object reference if nothing changed
        if (json === lastJsonRef.current && lastGeoJSONRef.current) {
            return lastGeoJSONRef.current;
        }

        lastJsonRef.current = json;
        lastGeoJSONRef.current = geoJSON;
        return geoJSON;
    }, [masterPolygon, visibleBounds]);

    return (
        <ShapeSource id={sourceId} shape={fogGeoJSON}>
            <FillLayer
                id={`${sourceId}-layer`}
                style={{
                    fillColor: FOG_COLOR,
                    fillOpacity: 1,
                }}
            />
        </ShapeSource>
    );
}
