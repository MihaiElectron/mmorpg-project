import { NAV_CELLS_PER_TILE } from "./worldCoordinates";

export type WalkabilityCell = 0 | 1;
export type WalkabilityGrid = WalkabilityCell[][];
// NavGrid : même structure que WalkabilityGrid, résolution finer (NAV_CELLS_PER_TILE² par tile)
export type NavGrid = WalkabilityGrid;

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

export function getWalkabilityGridStats(grid: WalkabilityGrid | null | undefined): {
  walkable: number;
  blocked: number;
} {
  if (!grid || grid.length === 0) return { walkable: 0, blocked: 0 };
  let blocked = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell === 1) blocked++;
    }
  }
  const total = grid.length * (grid[0]?.length ?? 0);
  return { walkable: total - blocked, blocked };
}

export function createNavGridFromWalkabilityGrid(
  walkabilityGrid: WalkabilityGrid | null | undefined,
  subdivisions: number = NAV_CELLS_PER_TILE,
): NavGrid {
  if (!walkabilityGrid || walkabilityGrid.length === 0) return [];
  const tileH = walkabilityGrid.length;
  const tileW = walkabilityGrid[0]?.length ?? 0;
  return Array.from({ length: tileH * subdivisions }, (_, navY) =>
    Array.from({ length: tileW * subdivisions }, (_, navX): WalkabilityCell =>
      walkabilityGrid[Math.floor(navY / subdivisions)]?.[Math.floor(navX / subdivisions)] ?? 0,
    ),
  );
}

export function isNavCellInNavGrid(
  navGrid: NavGrid | null | undefined,
  navX: number,
  navY: number,
): boolean {
  return isTileInWalkabilityGrid(navGrid, navX, navY);
}

export function getWalkabilityAtTile(
  grid: WalkabilityGrid | null | undefined,
  tileX: number,
  tileY: number,
): boolean | null {
  if (!isTileInWalkabilityGrid(grid, tileX, tileY)) return null;
  return grid[tileY][tileX] === 0;
}
