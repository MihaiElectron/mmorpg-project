export type WalkabilityCell = 0 | 1;
export type WalkabilityGrid = WalkabilityCell[][];

type TileLike = {
  collides?: boolean;
  index?: number;
  properties?: Record<string, unknown>;
};

type LayerLike = {
  tilemapLayer?: {
    getTileAt?: (x: number, y: number) => TileLike | null;
  };
  getTileAt?: (x: number, y: number) => TileLike | null;
};

type MapLike = {
  width: number;
  height: number;
};

function getTile(layer: LayerLike | null | undefined, x: number, y: number): TileLike | null {
  if (!layer) return null;
  if (typeof layer.getTileAt === "function") return layer.getTileAt(x, y);
  if (typeof layer.tilemapLayer?.getTileAt === "function") {
    return layer.tilemapLayer.getTileAt(x, y);
  }
  return null;
}

function isBlocked(tile: TileLike | null): boolean {
  if (!tile) return false;
  if (tile.properties?.walkable === false) return true;
  if (tile.properties?.blocked === true) return true;
  if (tile.properties?.collision === true) return true;
  return tile.collides === true;
}

export function createWalkabilityGridFromMap(
  map: MapLike,
  layer?: LayerLike | null,
): WalkabilityGrid {
  return Array.from({ length: map.height }, (_, y) =>
    Array.from({ length: map.width }, (_, x): WalkabilityCell =>
      isBlocked(getTile(layer, x, y)) ? 1 : 0,
    ),
  );
}

export function getWalkabilityGridSize(grid: WalkabilityGrid | null | undefined): {
  width: number;
  height: number;
} {
  return {
    width: grid?.[0]?.length ?? 0,
    height: grid?.length ?? 0,
  };
}

export function isTileInWalkabilityGrid(
  grid: WalkabilityGrid | null | undefined,
  tileX: number,
  tileY: number,
): boolean {
  const { width, height } = getWalkabilityGridSize(grid);
  return tileX >= 0 && tileY >= 0 && tileX < width && tileY < height;
}

export function getWalkabilityAtTile(
  grid: WalkabilityGrid | null | undefined,
  tileX: number,
  tileY: number,
): boolean | null {
  if (!isTileInWalkabilityGrid(grid, tileX, tileY)) return null;
  return grid[tileY][tileX] === 0;
}
