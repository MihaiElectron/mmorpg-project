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

// Recherche concentrique (anneaux de Chebyshev) autour de la cible.
// Retourne la première cellule walkable trouvée, ou null si aucune.
// Ordre de parcours : sens horaire depuis le coin haut-gauche de chaque anneau.
// Si la cible est déjà walkable, retour immédiat. Ne modifie jamais la grille.
export function findNearestWalkableCell(
  navGrid: NavGrid | null | undefined,
  targetNavX: number,
  targetNavY: number,
): { navX: number; navY: number } | null {
  if (!navGrid || navGrid.length === 0) return null;
  const height = navGrid.length;
  const width = navGrid[0]?.length ?? 0;
  if (width === 0) return null;
  if (targetNavX < 0 || targetNavY < 0 || targetNavX >= width || targetNavY >= height) return null;

  if (navGrid[targetNavY][targetNavX] === 0) {
    return { navX: targetNavX, navY: targetNavY };
  }

  const maxRadius = Math.max(width, height);
  for (let r = 1; r <= maxRadius; r++) {
    // Rangée supérieure (y = targetNavY - r)
    const yTop = targetNavY - r;
    if (yTop >= 0) {
      const xStart = Math.max(0, targetNavX - r);
      const xEnd = Math.min(width - 1, targetNavX + r);
      for (let x = xStart; x <= xEnd; x++) {
        if (navGrid[yTop][x] === 0) return { navX: x, navY: yTop };
      }
    }
    // Colonne droite (x = targetNavX + r)
    const xRight = targetNavX + r;
    if (xRight < width) {
      const yStart = Math.max(0, targetNavY - r + 1);
      const yEnd = Math.min(height - 1, targetNavY + r - 1);
      for (let y = yStart; y <= yEnd; y++) {
        if (navGrid[y][xRight] === 0) return { navX: xRight, navY: y };
      }
    }
    // Rangée inférieure (y = targetNavY + r)
    const yBot = targetNavY + r;
    if (yBot < height) {
      const xStart2 = Math.min(width - 1, targetNavX + r);
      const xEnd2 = Math.max(0, targetNavX - r);
      for (let x = xStart2; x >= xEnd2; x--) {
        if (navGrid[yBot][x] === 0) return { navX: x, navY: yBot };
      }
    }
    // Colonne gauche (x = targetNavX - r)
    const xLeft = targetNavX - r;
    if (xLeft >= 0) {
      const yStart2 = Math.min(height - 1, targetNavY + r - 1);
      const yEnd2 = Math.max(0, targetNavY - r + 1);
      for (let y = yStart2; y >= yEnd2; y--) {
        if (navGrid[y][xLeft] === 0) return { navX: xLeft, navY: y };
      }
    }
  }

  return null;
}

export function getWalkabilityAtTile(
  grid: WalkabilityGrid | null | undefined,
  tileX: number,
  tileY: number,
): boolean | null {
  if (!isTileInWalkabilityGrid(grid, tileX, tileY)) return null;
  return grid[tileY][tileX] === 0;
}
