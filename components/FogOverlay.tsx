import { ShapeSource, FillLayer } from "@rnmapbox/maps";
import { FOG_COLOR } from "../constants/map";
import { TileId, BoundingBox, filterTilesInBounds, buildFogGeoJSON } from "../lib/tiles";

type Props = {
    exploredTiles: TileId[];
    visibleBounds: BoundingBox;
};

// Renders fog overlay on map, only tiles within viewport are included
export function FogOverlay({ exploredTiles, visibleBounds }: Props) {
    const visibleTiles = filterTilesInBounds(exploredTiles, visibleBounds);
    const fogGeoJSON = buildFogGeoJSON(visibleTiles);

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
