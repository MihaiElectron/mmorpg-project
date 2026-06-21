import {
  DEFAULT_MAP_ID,
  TILE_SIZE_WU,
  ISO_HALF_TILE_WIDTH_PX,
  isoScreenToWorldWU,
  WorldPosition,
} from './world-coordinates';

export interface LegacyPixelPosition {
  x: number;
  y: number;
}

export interface WorldPositionWithMap extends WorldPosition {
  mapId: number;
}

/**
 * Convert a legacy Phaser pixel position to WU coordinates.
 * Uses the validated origin (originX=1000, originY=0) from world-coordinates.ts.
 */
export function pixelToWU(pos: LegacyPixelPosition): WorldPosition {
  return isoScreenToWorldWU(pos.x, pos.y);
}

/**
 * Convert a legacy Phaser pixel position to WU coordinates with the default mapId.
 */
export function pixelToWUWithMap(pos: LegacyPixelPosition): WorldPositionWithMap {
  const { worldX, worldY } = isoScreenToWorldWU(pos.x, pos.y);
  return { worldX, worldY, mapId: DEFAULT_MAP_ID };
}

/**
 * Convert a legacy pixel radius to an approximate WU radius.
 *
 * APPROXIMATION TEMPORAIRE : la future métrique de range est Chebyshev WU,
 * non pas Euclidien en pixels. Ce facteur (16 = TILE_SIZE_WU /
 * ISO_HALF_TILE_WIDTH_PX) convertit un rayon pixel en rayon WU en utilisant
 * le coefficient vertical de la projection isométrique, qui est le plus grand
 * des deux coefficients directionnels (8 horizontal, 16 vertical). Il donne
 * donc un rayon WU généreux. À recalibrer manuellement en Phase 8.
 */
export function legacyRadiusToWU(radiusPx: number): number {
  return Math.round(radiusPx * (TILE_SIZE_WU / ISO_HALF_TILE_WIDTH_PX));
}
