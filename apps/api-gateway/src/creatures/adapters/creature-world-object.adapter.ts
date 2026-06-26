import { Creature } from '../entities/creature.entity';

export type CreatureCapability =
  | 'transform'   // position dans le monde (WU)
  | 'combat'      // peut être attaqué
  | 'health'      // barre de vie
  | 'persistence' // état persisté en base de données
  | 'validation'; // règles de cohérence exposables au Studio

export interface CreatureWorldObject {
  readonly kind: 'entity';
  readonly category: 'creature';
  readonly id: string;
  readonly type: string;
  readonly mapId: number | null;
  readonly position: { readonly worldX: number; readonly worldY: number } | null;
  readonly state: string;
  readonly health: number;
  /** baseHealth du template — null si le spawn/template n'est pas chargé. */
  readonly maxHealth: number | null;
  readonly capabilities: readonly CreatureCapability[];
  readonly metadata: {
    readonly respawnAt: Date | null;
    /** Override de délai par instance (null = hérite du spawn/template). */
    readonly instanceRespawnDelayMs: number | null;
  };
}

const CREATURE_CAPABILITIES: readonly CreatureCapability[] = Object.freeze([
  'transform', 'combat', 'health', 'persistence', 'validation',
]);

export function toCreatureWorldObject(creature: Creature): CreatureWorldObject {
  const hasWU =
    creature.worldX != null && creature.worldY != null && creature.mapId != null;

  const position = hasWU
    ? { worldX: creature.worldX!, worldY: creature.worldY! }
    : null;

  return Object.freeze({
    kind: 'entity',
    category: 'creature',
    id: creature.id,
    type: creature.spawn?.template?.key ?? 'unknown',
    mapId: creature.mapId ?? null,
    position,
    state: creature.state,
    health: creature.health,
    maxHealth: creature.spawn?.template?.baseHealth ?? null,
    capabilities: CREATURE_CAPABILITIES,
    metadata: Object.freeze({
      respawnAt: creature.respawnAt ?? null,
      instanceRespawnDelayMs: creature.respawnDelayMs ?? null,
    }),
  });
}
