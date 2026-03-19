import { useState, useEffect } from "react";
import { TileId } from "../lib/tiles";
import { initDatabase, getAllTiles } from "../lib/database";
import { LOCATION_UPDATE_INTERVAL_MS } from "../constants/map";

// initializes local db and returns current list of explored tiles
// polls on same interval as location updates so fog stays in sync w background task
export function useTiles(): TileId[] {
    const [tiles, setTiles] = useState<TileId[]>([]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;

        (async () => {
            await initDatabase();
            const existing = await getAllTiles();
            setTiles(existing);

            interval = setInterval(async () => {
                const updated = await getAllTiles();
                setTiles(updated);
            }, LOCATION_UPDATE_INTERVAL_MS);
        })();

        return () => clearInterval(interval);
    }, []);

    return tiles;
}