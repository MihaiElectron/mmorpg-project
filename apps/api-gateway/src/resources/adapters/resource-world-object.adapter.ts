/**
 * resource-world-object.adapter.ts
 *
 * Adapter read-only : transforme une Resource en WorldObject minimal
 * exploitable par le Studio SDK.
 *
 * Aucune dépendance DB. Aucun effet de bord. Aucune logique métier.
 * Conforme au WOM (world-object-model.md) et au Studio SDK (studio-sdk.md).
 */

import { Resource } from '../entities/resource.entity';
import { ResourceTemplate } from '../entities/resource-template.entity';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Capacités actuellement supportées par l'implémentation Resource.
 * Reflect strictly what exists — no respawn, no node_member, no maturity.
 */
export type ResourceCapability =
  | 'transform'    // position dans le monde (WU ou legacy pixels)
  | 'harvestable'  // récolte avec charges restantes
  | 'loot'         // produit un loot lors d'une récolte (LootService)
  | 'persistence'  // état persisté en base de données
  | 'validation';  // règles de cohérence exposables au Studio

export interface ResourcePosition {
  readonly worldX: number;
  readonly worldY: number;
}

export interface ResourceMetadata {
  /** Coordonnées pixel legacy si présentes dans l'entité source. */
  readonly legacy: { readonly x: number; readonly y: number } | null;
  /** Délai de respawn en ms depuis le ResourceTemplate. Null si template absent. */
  readonly respawnDelayMs: number | null;
  /** Nombre d'entrées valides dans le lootPool du template. Null si template absent. */
  readonly lootPoolCount: number | null;
  /** itemId de chaque entrée valide du lootPool. Null si template absent. */
  readonly lootPoolItems: readonly string[] | null;
}

/**
 * WorldObject minimal représentant une Resource côté Studio SDK.
 * Toutes les propriétés sont en lecture seule.
 */
export interface ResourceWorldObject {
  readonly kind: 'entity';
  readonly category: 'resource';
  readonly id: string;
  /** Type fonctionnel de la Resource — identique au champ template (ex: "dead_tree"). */
  readonly type: string;
  readonly mapId: number | null;
  /**
   * Position WU si worldX/worldY sont non-null dans l'entité source.
   * null si seules les coordonnées legacy (pixels) sont disponibles.
   */
  readonly position: ResourcePosition | null;
  readonly state: 'alive' | 'dead';
  readonly remainingLoots: number;
  readonly capabilities: readonly ResourceCapability[];
  readonly metadata: ResourceMetadata;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractLootPool(pool: any[] | null | undefined): { count: number; items: string[] } | null {
  if (!Array.isArray(pool)) return null;
  const items = pool
    .filter(
      (e): e is { itemId: string } =>
        typeof e === 'object' && e !== null && typeof e.itemId === 'string' && e.itemId.length > 0,
    )
    .map((e) => e.itemId);
  return { count: items.length, items };
}

// ─── Capacités constantes ─────────────────────────────────────────────────────

/**
 * Liste fixe des capacités exposées par toute Resource dans l'état actuel
 * de l'implémentation.
 */
const RESOURCE_CAPABILITIES: readonly ResourceCapability[] = Object.freeze([
  'transform',
  'harvestable',
  'loot',
  'persistence',
  'validation',
]);

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Transforme une Resource en ResourceWorldObject read-only.
 *
 * Règles :
 * - position WU si worldX/worldY/mapId sont tous non-null → position renseignée.
 * - position null si worldX ou worldY est absent (legacy-only ou données manquantes).
 * - x/y legacy toujours inclus dans metadata.legacy si les valeurs sont finies.
 * - capabilities : ensemble fixe des 5 capacités actuellement implémentées.
 * - respawnDelayMs exposé dans metadata si template fourni, null sinon.
 * - lootPoolCount/lootPoolItems extraits des entrées valides du template, null sinon.
 */
export function toResourceWorldObject(
  resource: Resource,
  template?: Pick<ResourceTemplate, 'respawnDelayMs' | 'lootPool'> | null,
): ResourceWorldObject {
  const hasWU =
    resource.worldX != null &&
    resource.worldY != null &&
    resource.mapId != null;

  const position: ResourcePosition | null = hasWU
    ? { worldX: resource.worldX!, worldY: resource.worldY! }
    : null;

  const hasFiniteLegacy =
    Number.isFinite(resource.x) && Number.isFinite(resource.y);

  const legacy: ResourceMetadata['legacy'] = hasFiniteLegacy
    ? { x: resource.x, y: resource.y }
    : null;

  return Object.freeze({
    kind: 'entity',
    category: 'resource',
    id: resource.id,
    type: resource.type,
    mapId: resource.mapId ?? null,
    position,
    state: resource.state,
    remainingLoots: resource.remainingLoots,
    capabilities: RESOURCE_CAPABILITIES,
    metadata: Object.freeze({
      legacy,
      respawnDelayMs: template?.respawnDelayMs ?? null,
      ...(() => {
        const lp = extractLootPool(template?.lootPool);
        return { lootPoolCount: lp?.count ?? null, lootPoolItems: lp ? Object.freeze(lp.items) : null };
      })(),
    }),
  });
}
