/**
 * WU Backfill Dry-Run Report
 *
 * Fonctions pures de vérification du futur backfill pixel → WU.
 * Ne lit pas la DB, n'écrit jamais. Le caller fournit les données.
 *
 * Usage prévu (Phase 3) :
 *   const chars = await characterRepo.find();
 *   const report = generateEntityReport('character', chars,
 *     r => ({ x: (r as any).positionX, y: (r as any).positionY }));
 *   console.log(formatReport(generateDryRunReport([report])));
 */

import { pixelToWUWithMap } from './legacy-pixel-position.adapter';

// ─── Constants ────────────────────────────────────────────────────────────────

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;
const DEFAULT_MAX_SAMPLES = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Projection minimale attendue de chaque entité pour le rapport. */
export interface PositionedRecord {
  id: string | number;
  worldX?: number | null;
  worldY?: number | null;
  mapId?: number | null;
}

export interface BackfillSample {
  id: string | number;
  legacyX: number;
  legacyY: number;
  worldX: number;
  worldY: number;
  mapId: number;
}

export type AnomalyKind =
  | 'MISSING_PIXEL_COORDS'
  | 'NON_FINITE_PIXEL'
  | 'PARTIAL_WU_FILL'
  | 'MAPID_MISSING_FOR_WU'
  | 'OUT_OF_INT32';

export interface BackfillAnomaly {
  id: string | number;
  kind: AnomalyKind;
  detail: string;
}

export interface EntityBackfillReport {
  entityName: string;
  total: number;
  alreadyFilled: number;
  toBackfill: number;
  samples: BackfillSample[];
  anomalies: BackfillAnomaly[];
}

export interface WuBackfillDryRunReport {
  entities: EntityBackfillReport[];
  totalRows: number;
  totalToBackfill: number;
  totalAnomalies: number;
}

// ─── Core report logic ────────────────────────────────────────────────────────

/**
 * Génère le rapport de dry-run pour un type d'entité.
 *
 * @param entityName   Nom lisible de l'entité (ex: 'character').
 * @param records      Tableau des enregistrements lus en DB.
 * @param getLegacy    Fonction qui extrait (x, y) pixel depuis un record,
 *                     ou null si les coordonnées sont absentes.
 * @param maxSamples   Nombre maximum d'exemples avant/après à inclure.
 */
export function generateEntityReport(
  entityName: string,
  records: PositionedRecord[],
  getLegacy: (r: PositionedRecord) => { x: number; y: number } | null,
  maxSamples: number = DEFAULT_MAX_SAMPLES,
): EntityBackfillReport {
  let alreadyFilled = 0;
  let toBackfill = 0;
  const samples: BackfillSample[] = [];
  const anomalies: BackfillAnomaly[] = [];

  for (const record of records) {
    const hasWX = record.worldX != null;
    const hasWY = record.worldY != null;
    const hasMap = record.mapId != null;
    const anySet = hasWX || hasWY || hasMap;
    const allSet = hasWX && hasWY && hasMap;

    if (allSet) {
      alreadyFilled++;
      continue;
    }

    // Anomalies sur le remplissage partiel des colonnes WU
    if (anySet) {
      if (hasWX && hasWY && !hasMap) {
        anomalies.push({
          id: record.id,
          kind: 'MAPID_MISSING_FOR_WU',
          detail: `worldX=${record.worldX} worldY=${record.worldY} mais mapId est null`,
        });
      } else {
        anomalies.push({
          id: record.id,
          kind: 'PARTIAL_WU_FILL',
          detail: `worldX=${record.worldX ?? 'null'} worldY=${record.worldY ?? 'null'} mapId=${record.mapId ?? 'null'}`,
        });
      }
    }

    // Récupération des coordonnées pixel legacy
    const legacy = getLegacy(record);

    if (legacy === null || legacy.x == null || legacy.y == null) {
      anomalies.push({
        id: record.id,
        kind: 'MISSING_PIXEL_COORDS',
        detail: 'coordonnées pixel legacy null/undefined',
      });
      toBackfill++;
      continue;
    }

    if (!Number.isFinite(legacy.x) || !Number.isFinite(legacy.y)) {
      anomalies.push({
        id: record.id,
        kind: 'NON_FINITE_PIXEL',
        detail: `x=${legacy.x} y=${legacy.y}`,
      });
      toBackfill++;
      continue;
    }

    // Conversion pixel → WU
    const converted = pixelToWUWithMap(legacy);

    // Vérification plage int32
    if (
      converted.worldX < INT32_MIN || converted.worldX > INT32_MAX ||
      converted.worldY < INT32_MIN || converted.worldY > INT32_MAX
    ) {
      anomalies.push({
        id: record.id,
        kind: 'OUT_OF_INT32',
        detail: `worldX=${converted.worldX} worldY=${converted.worldY}`,
      });
    }

    toBackfill++;

    if (samples.length < maxSamples) {
      samples.push({
        id: record.id,
        legacyX: legacy.x,
        legacyY: legacy.y,
        worldX: converted.worldX,
        worldY: converted.worldY,
        mapId: converted.mapId,
      });
    }
  }

  return { entityName, total: records.length, alreadyFilled, toBackfill, samples, anomalies };
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

/** Agrège les rapports par entité en un rapport global. */
export function generateDryRunReport(
  entityReports: EntityBackfillReport[],
): WuBackfillDryRunReport {
  return {
    entities: entityReports,
    totalRows: entityReports.reduce((s, r) => s + r.total, 0),
    totalToBackfill: entityReports.reduce((s, r) => s + r.toBackfill, 0),
    totalAnomalies: entityReports.reduce((s, r) => s + r.anomalies.length, 0),
  };
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Formate le rapport global en texte lisible pour la console. */
export function formatReport(report: WuBackfillDryRunReport): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════',
    '  WU BACKFILL DRY-RUN REPORT',
    `  Lignes totales   : ${report.totalRows}`,
    `  À backfiller     : ${report.totalToBackfill}`,
    `  Anomalies totales: ${report.totalAnomalies}`,
    '═══════════════════════════════════════════════════',
  ];

  for (const entity of report.entities) {
    lines.push('');
    lines.push(`── ${entity.entityName} ${'─'.repeat(Math.max(0, 44 - entity.entityName.length))}`);
    lines.push(`   total         : ${entity.total}`);
    lines.push(`   déjà en WU    : ${entity.alreadyFilled}`);
    lines.push(`   à backfiller  : ${entity.toBackfill}`);

    if (entity.samples.length > 0) {
      lines.push('   exemples (avant → après) :');
      for (const s of entity.samples) {
        lines.push(
          `     [${s.id}]  pixel(${s.legacyX}, ${s.legacyY})` +
          `  →  WU(${s.worldX}, ${s.worldY})  mapId=${s.mapId}`,
        );
      }
    }

    if (entity.anomalies.length > 0) {
      lines.push(`   anomalies (${entity.anomalies.length}) :`);
      for (const a of entity.anomalies) {
        lines.push(`     [${a.id}]  ${a.kind}: ${a.detail}`);
      }
    }
  }

  return lines.join('\n');
}
