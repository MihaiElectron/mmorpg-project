/**
 * creature-spawn-world-object.adapter.ts
 *
 * Adapter read-only : transforme un CreatureSpawn en WorldObject minimal
 * exploitable par le Studio SDK.
 *
 * Aucune dépendance DB. Aucun effet de bord. Aucune logique métier.
 * kind "spawn_point" — distinct des entités vivantes (Animal, Resource).
 */

import { CreatureSpawn } from '../entities/creature-spawn.entity';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreatureSpawnCapability =
  | 'transform'    // position dans le monde (WU ou legacy pixels)
  | 'spawn'        // génère une instance d'Animal au démarrage ou via admin
  | 'respawn'      // timer configurable — anime le cycle mort/résurrection
  | 'patrol'       // rayon de patrouille défini par le template
  | 'persistence'  // état persisté en base de données
  | 'validation';  // règles de cohérence exposables au Studio

export interface CreatureSpawnPosition {
  readonly worldX: number;
  readonly worldY: number;
}

export interface CreatureSpawnMetadata {
  /** Clé unique du spawn (ex: "turkey_spawn_1", "admin-goblin-1718000000"). */
  readonly key: string;
  /** Clé du template lié (ex: "turkey"). null si template non chargé. */
  readonly templateKey: string | null;
  /** Nom lisible du template (ex: "Turkey"). null si template non chargé. */
  readonly templateName: string | null;
  /** Coordonnées pixel legacy si présentes et finies dans l'entité source. */
  readonly legacy: { readonly spawnX: number; readonly spawnY: number } | null;
  /** Rayon de patrouille en pixels (source : CreatureTemplate.patrolRadius). null si template absent. */
  readonly patrolRadius: number | null;
  /** Délai de respawn en millisecondes (source : CreatureSpawn.respawnDelayMs). */
  readonly respawnDelayMs: number;
}

/**
 * WorldObject minimal représentant un CreatureSpawn côté Studio SDK.
 * Toutes les propriétés sont en lecture seule.
 */
export interface CreatureSpawnWorldObject {
  readonly kind: 'spawn_point';
  readonly category: 'creature_spawn';
  readonly id: string;
  /**
   * Type fonctionnel du spawn.
   * Priorité : template.key (ex: "turkey") → fallback : spawn.key.
   */
  readonly type: string;
  readonly mapId: number | null;
  /**
   * Position WU si worldX/worldY/mapId sont tous non-null.
   * null si seules les coordonnées legacy (pixels) sont disponibles.
   */
  readonly position: CreatureSpawnPosition | null;
  /** Toujours "active" — un spawn est soit actif, soit supprimé. */
  readonly state: 'active';
  readonly capabilities: readonly CreatureSpawnCapability[];
  readonly metadata: CreatureSpawnMetadata;
}

// ─── Capacités constantes ─────────────────────────────────────────────────────

const CREATURE_SPAWN_CAPABILITIES: readonly CreatureSpawnCapability[] = Object.freeze([
  'transform',
  'spawn',
  'respawn',
  'patrol',
  'persistence',
  'validation',
]);

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Transforme un CreatureSpawn en CreatureSpawnWorldObject read-only.
 *
 * Règles :
 * - position WU si worldX/worldY/mapId sont tous non-null.
 * - position null si l'un des trois est absent (legacy-only ou pas encore backfillé).
 * - spawnX/spawnY legacy inclus dans metadata.legacy si les deux valeurs sont finies.
 * - type = template.key si le template est chargé, sinon spawn.key.
 * - state est toujours "active" — les spawns supprimés ne sont pas exposés.
 * - patrolRadius : transmis tel quel en pixels depuis le template (unité legacy — voir ADR-0001).
 */
export function toCreatureSpawnWorldObject(spawn: CreatureSpawn): CreatureSpawnWorldObject {
  const hasWU =
    spawn.worldX != null &&
    spawn.worldY != null &&
    spawn.mapId  != null;

  const position: CreatureSpawnPosition | null = hasWU
    ? { worldX: spawn.worldX!, worldY: spawn.worldY! }
    : null;

  const hasFiniteLegacy =
    Number.isFinite(spawn.spawnX) && Number.isFinite(spawn.spawnY);

  const legacy: CreatureSpawnMetadata['legacy'] = hasFiniteLegacy
    ? { spawnX: spawn.spawnX, spawnY: spawn.spawnY }
    : null;

  return Object.freeze({
    kind:     'spawn_point',
    category: 'creature_spawn',
    id:       spawn.id,
    type:     spawn.template?.key ?? spawn.key,
    mapId:    spawn.mapId ?? null,
    position,
    state:    'active',
    capabilities: CREATURE_SPAWN_CAPABILITIES,
    metadata: Object.freeze({
      key:          spawn.key,
      templateKey:  spawn.template?.key  ?? null,
      templateName: spawn.template?.name ?? null,
      legacy,
      patrolRadius:   spawn.template?.patrolRadius  ?? null,
      respawnDelayMs: spawn.respawnDelayMs,
    }),
  });
}
