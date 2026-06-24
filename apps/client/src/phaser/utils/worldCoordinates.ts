export type ScreenPoint = { x: number; y: number };
export type WorldWUPoint = { worldX: number; worldY: number };
export type TilePoint = { tileX: number; tileY: number };
export type NavCellPoint = { navX: number; navY: number };
export type MapOrigin = ScreenPoint;

export const TILE_SIZE_WU = 1024;
export const TILE_SHIFT = 10;
export const CHUNK_SHIFT = 16;
// Navigation grid : 8×8 nav cells per logical tile, each cell = 128 WU = 2^7
export const NAV_CELL_SIZE_WU = 128;
export const NAV_CELL_SHIFT = 7;
export const NAV_CELLS_PER_TILE = 8; // TILE_SIZE_WU / NAV_CELL_SIZE_WU
export const DEFAULT_MAP_ORIGIN: MapOrigin = { x: 1000, y: 0 };

export function worldWUToScreen(
  worldX: number,
  worldY: number,
  origin: MapOrigin = DEFAULT_MAP_ORIGIN,
): ScreenPoint {
  return {
    x: Math.round(origin.x + (worldX - worldY) / 16),
    y: Math.round(origin.y + (worldX + worldY) / 32),
  };
}

export function screenToWorldWU(
  screenX: number,
  screenY: number,
  origin: MapOrigin = DEFAULT_MAP_ORIGIN,
): WorldWUPoint {
  return {
    worldX: Math.round(8 * (screenX - origin.x) + 16 * (screenY - origin.y)),
    worldY: Math.round(-8 * (screenX - origin.x) + 16 * (screenY - origin.y)),
  };
}

export function worldWUToTile(worldX: number, worldY: number): TilePoint {
  return {
    tileX: worldX >> TILE_SHIFT,
    tileY: worldY >> TILE_SHIFT,
  };
}

export function tileToWorldWU(tileX: number, tileY: number): WorldWUPoint {
  return {
    worldX: tileX * TILE_SIZE_WU,
    worldY: tileY * TILE_SIZE_WU,
  };
}

export function worldWUToChunk(worldX: number, worldY: number): { chunkX: number; chunkY: number } {
  return {
    chunkX: worldX >> CHUNK_SHIFT,
    chunkY: worldY >> CHUNK_SHIFT,
  };
}

export function worldWUToNavCell(worldX: number, worldY: number): NavCellPoint {
  return {
    navX: worldX >> NAV_CELL_SHIFT,
    navY: worldY >> NAV_CELL_SHIFT,
  };
}

export function navCellToWorldWU(navX: number, navY: number): WorldWUPoint {
  return {
    worldX: navX << NAV_CELL_SHIFT,
    worldY: navY << NAV_CELL_SHIFT,
  };
}
