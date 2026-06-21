// ─── Constants ───────────────────────────────────────────────────────────────

/** WU per tile axis. 1 tile = 2^10 WU. */
export const TILE_SIZE_WU = 1024;

/** log2(TILE_SIZE_WU) — used for bit-shift conversions. */
export const TILE_SHIFT = 10;

/** Bit-mask for the sub-tile offset within a WU value (TILE_SIZE_WU − 1). */
export const TILE_MASK = 1023;

/** Tiles per chunk axis. 1 chunk = 2^6 tiles. */
export const CHUNK_SIZE_TILES = 64;

/** log2(CHUNK_SIZE_WU) = TILE_SHIFT + log2(CHUNK_SIZE_TILES) = 10 + 6. */
export const CHUNK_SHIFT = 16;

/** WU per chunk axis (CHUNK_SIZE_TILES × TILE_SIZE_WU). */
export const CHUNK_SIZE_WU = 65536;

/** Half the visual tile width in Phaser px (isometric tile: 128 px wide). */
export const ISO_HALF_TILE_WIDTH_PX = 64;

/** Half the visual tile height in Phaser px (isometric tile: 64 px tall). */
export const ISO_HALF_TILE_HEIGHT_PX = 32;

/**
 * Phaser world pixel X of the isometric north vertex of tile (0, 0).
 * Derivation: map.createLayer offsetX=936 + ISO_HALF_TILE_WIDTH_PX=64 = 1000.
 */
export const WORLD_ORIGIN_X_PX = 1000;

/** Phaser world pixel Y of the isometric north vertex of tile (0, 0). */
export const WORLD_ORIGIN_Y_PX = 0;

/** Default mapId until a real map table is introduced (migration Phase 2). */
export const DEFAULT_MAP_ID = 1;

// ─── Derived projection coefficients (internal) ───────────────────────────────

/** WU per horizontal screen pixel: TILE_SIZE_WU / ISO_HALF_TILE_WIDTH_PX = 16. */
const WU_PER_PX_X = TILE_SIZE_WU / ISO_HALF_TILE_WIDTH_PX;

/** WU per vertical screen pixel: TILE_SIZE_WU / ISO_HALF_TILE_HEIGHT_PX = 32. */
const WU_PER_PX_Y = TILE_SIZE_WU / ISO_HALF_TILE_HEIGHT_PX;

/** Inverse projection horizontal coefficient: TILE_SIZE_WU / (2 × ISO_HALF_TILE_WIDTH_PX) = 8. */
const INV_COEFF_X = TILE_SIZE_WU / (2 * ISO_HALF_TILE_WIDTH_PX);

/** Inverse projection vertical coefficient: TILE_SIZE_WU / (2 × ISO_HALF_TILE_HEIGHT_PX) = 16. */
const INV_COEFF_Y = TILE_SIZE_WU / (2 * ISO_HALF_TILE_HEIGHT_PX);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorldPosition {
  worldX: number;
  worldY: number;
}

export interface WorldPoint extends WorldPosition {
  mapId: number;
}

export interface IsoScreenPoint {
  screenX: number;
  screenY: number;
}

// ─── WU ↔ Tile ───────────────────────────────────────────────────────────────

/** Tile index → north-edge WU coordinate. */
export function tileToWU(tile: number): number {
  return tile << TILE_SHIFT;
}

/** WU → containing tile index (arithmetic floor for signed values). */
export function wuToTileIndex(wu: number): number {
  return wu >> TILE_SHIFT;
}

/** WU → fractional tile position. */
export function wuToTileFloat(wu: number): number {
  return wu / TILE_SIZE_WU;
}

/** WU → sub-tile offset within the tile, range [0, TILE_SIZE_WU − 1]. */
export function wuToSubTile(wu: number): number {
  return wu & TILE_MASK;
}

/** WU coordinate of the visual centre of a tile (tile × 1024 + 512). */
export function tileCenterToWU(tile: number): number {
  return (tile << TILE_SHIFT) + (TILE_SIZE_WU >> 1);
}

// ─── WU ↔ Chunk ──────────────────────────────────────────────────────────────

/** WU → containing chunk index. */
export function wuToChunkIndex(wu: number): number {
  return wu >> CHUNK_SHIFT;
}

// ─── Isometric projection: WU → Phaser screen pixels ─────────────────────────

/**
 * Project WU world coordinates to isometric screen X.
 *   screenX = originX + (worldX − worldY) / 16
 */
export function wuToIsoScreenX(
  worldX: number,
  worldY: number,
  originX: number = WORLD_ORIGIN_X_PX,
): number {
  return originX + (worldX - worldY) / WU_PER_PX_X;
}

/**
 * Project WU world coordinates to isometric screen Y.
 *   screenY = originY + (worldX + worldY) / 32
 */
export function wuToIsoScreenY(
  worldX: number,
  worldY: number,
  originY: number = WORLD_ORIGIN_Y_PX,
): number {
  return originY + (worldX + worldY) / WU_PER_PX_Y;
}

// ─── Isometric inverse projection: Phaser screen pixels → WU ─────────────────

/**
 * Convert isometric screen pixels to World Units.
 * Throws RangeError on non-finite inputs.
 *
 * From solving the forward projection system:
 *   worldX = 8 × (screenX − originX) + 16 × (screenY − originY)
 *   worldY = −8 × (screenX − originX) + 16 × (screenY − originY)
 */
export function isoScreenToWorldWU(
  screenX: number,
  screenY: number,
  originX: number = WORLD_ORIGIN_X_PX,
  originY: number = WORLD_ORIGIN_Y_PX,
): WorldPosition {
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
    throw new RangeError(
      `isoScreenToWorldWU: screen coordinates must be finite, got (${screenX}, ${screenY})`,
    );
  }
  const sx = screenX - originX;
  const sy = screenY - originY;
  return {
    worldX: Math.round(INV_COEFF_X * sx + INV_COEFF_Y * sy),
    worldY: Math.round(-INV_COEFF_X * sx + INV_COEFF_Y * sy),
  };
}

// ─── Distance functions ───────────────────────────────────────────────────────

/**
 * Chebyshev distance in WU (L∞ norm).
 * Use for all gameplay range checks (attack, gather, aggro).
 * A square in WU tile-space projects to a diamond in isometric view.
 */
export function chebyshevDistanceWU(a: WorldPosition, b: WorldPosition): number {
  return Math.max(Math.abs(a.worldX - b.worldX), Math.abs(a.worldY - b.worldY));
}

/**
 * Euclidean distance in WU.
 * Use only for "nearest entity" searches or direction normalisation.
 * Do NOT use for gameplay range gates — prefer chebyshevDistanceWU.
 */
export function euclideanDistanceWU(a: WorldPosition, b: WorldPosition): number {
  const dx = a.worldX - b.worldX;
  const dy = a.worldY - b.worldY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Squared Euclidean distance in WU.
 * Use when only relative ordering matters (avoids the sqrt cost).
 */
export function euclideanDistanceSquaredWU(a: WorldPosition, b: WorldPosition): number {
  const dx = a.worldX - b.worldX;
  const dy = a.worldY - b.worldY;
  return dx * dx + dy * dy;
}
