/**
 * world-position.adapter.ts
 *
 * Adapter de lecture de position serveur avec fallback vers les coordonnées
 * pixel legacy. Ne touche pas la DB, n'émet aucun événement réseau.
 *
 * Usage prévu (Phase 4, sans supprimer les colonnes legacy) :
 *   const pos = readWorldPosition(character, (c) => ({ x: c.positionX, y: c.positionY }));
 *   // → { worldX, worldY, mapId } toujours valide, quelle que soit la source
 */

import { pixelToWUWithMap, WorldPositionWithMap } from './legacy-pixel-position.adapter';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Projection minimale d'une entité positionnelle côté serveur. */
export interface WUPositionRecord {
  worldX?: number | null;
  worldY?: number | null;
  mapId?: number | null;
}

export type WorldPositionErrorKind =
  | 'PARTIAL_WU'       // worldX/worldY/mapId partiellement remplis
  | 'MISSING_LEGACY'   // colonnes WU absentes ET pas de coordonnées pixel
  | 'INVALID_LEGACY';  // coordonnées pixel présentes mais non finies (NaN, ±Infinity)

export class WorldPositionError extends Error {
  readonly kind: WorldPositionErrorKind;

  constructor(message: string, kind: WorldPositionErrorKind) {
    super(message);
    this.name = 'WorldPositionError';
    this.kind = kind;
  }
}

// ─── Guards ───────────────────────────────────────────────────────────────────

/** Retourne true si worldX, worldY et mapId sont tous non-null. */
export function hasCompleteWorldPosition(record: WUPositionRecord): boolean {
  return record.worldX != null && record.worldY != null && record.mapId != null;
}

/**
 * Retourne true si au moins une colonne WU est remplie mais pas les trois.
 * Signale un état de migration incohérent.
 */
export function hasPartialWorldPosition(record: WUPositionRecord): boolean {
  const hasX   = record.worldX != null;
  const hasY   = record.worldY != null;
  const hasMap = record.mapId  != null;
  const anySet = hasX || hasY || hasMap;
  const allSet = hasX && hasY && hasMap;
  return anySet && !allSet;
}

// ─── Lecture ──────────────────────────────────────────────────────────────────

/**
 * Retourne la position WU d'une entité serveur.
 *
 * Ordre de priorité :
 *   1. Colonnes WU complètes (worldX / worldY / mapId) → retournées directement.
 *   2. Colonnes WU partielles → lance WorldPositionError(PARTIAL_WU).
 *   3. Colonnes WU absentes   → legacyGetter appelé, conversion pixelToWUWithMap.
 *      - legacyGetter retourne null ou coords undefined → MISSING_LEGACY.
 *      - coordonnées non finies (NaN, ±Infinity)       → INVALID_LEGACY.
 *
 * @param record       Entité ou projection contenant worldX / worldY / mapId.
 * @param legacyGetter Extrait les coordonnées pixel legacy de l'entité.
 */
export function readWorldPosition(
  record: WUPositionRecord,
  legacyGetter: (r: WUPositionRecord) => { x: number; y: number } | null,
): WorldPositionWithMap {
  // ── 1. Position WU complète ──────────────────────────────────────────────
  if (hasCompleteWorldPosition(record)) {
    return {
      worldX: record.worldX!,
      worldY: record.worldY!,
      mapId:  record.mapId!,
    };
  }

  // ── 2. Position WU partielle (état de migration incohérent) ─────────────
  if (hasPartialWorldPosition(record)) {
    throw new WorldPositionError(
      `Partial WU position: worldX=${record.worldX ?? 'null'} ` +
      `worldY=${record.worldY ?? 'null'} mapId=${record.mapId ?? 'null'}`,
      'PARTIAL_WU',
    );
  }

  // ── 3. Fallback legacy pixels ────────────────────────────────────────────
  const legacy = legacyGetter(record);

  if (legacy === null || legacy.x == null || legacy.y == null) {
    throw new WorldPositionError(
      'Position WU absente et aucune coordonnée pixel legacy disponible',
      'MISSING_LEGACY',
    );
  }

  if (!Number.isFinite(legacy.x) || !Number.isFinite(legacy.y)) {
    throw new WorldPositionError(
      `Coordonnées pixel legacy invalides : x=${legacy.x} y=${legacy.y}`,
      'INVALID_LEGACY',
    );
  }

  return pixelToWUWithMap(legacy);
}
