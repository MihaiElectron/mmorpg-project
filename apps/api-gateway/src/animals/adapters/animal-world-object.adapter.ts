import { Animal } from '../entities/animal.entity';

export type AnimalCapability =
  | 'transform'   // position dans le monde (WU ou legacy pixels)
  | 'combat'      // peut être attaqué
  | 'health'      // barre de vie
  | 'persistence' // état persisté en base de données
  | 'validation'; // règles de cohérence exposables au Studio

export interface AnimalWorldObject {
  readonly kind: 'entity';
  readonly category: 'animal';
  readonly id: string;
  readonly type: string;
  readonly mapId: number | null;
  readonly position: { readonly worldX: number; readonly worldY: number } | null;
  readonly state: string;
  readonly health: number;
  /** baseHealth du template — null si le spawn/template n'est pas chargé. */
  readonly maxHealth: number | null;
  readonly capabilities: readonly AnimalCapability[];
  readonly metadata: {
    readonly legacy: { readonly x: number; readonly y: number } | null;
  };
}

const ANIMAL_CAPABILITIES: readonly AnimalCapability[] = Object.freeze([
  'transform', 'combat', 'health', 'persistence', 'validation',
]);

export function toAnimalWorldObject(animal: Animal): AnimalWorldObject {
  const hasWU =
    animal.worldX != null && animal.worldY != null && animal.mapId != null;

  const position = hasWU
    ? { worldX: animal.worldX!, worldY: animal.worldY! }
    : null;

  const legacy =
    Number.isFinite(animal.x) && Number.isFinite(animal.y)
      ? { x: animal.x, y: animal.y }
      : null;

  return Object.freeze({
    kind: 'entity',
    category: 'animal',
    id: animal.id,
    type: animal.spawn?.template?.key ?? 'unknown',
    mapId: animal.mapId ?? null,
    position,
    state: animal.state,
    health: animal.health,
    maxHealth: animal.spawn?.template?.baseHealth ?? null,
    capabilities: ANIMAL_CAPABILITIES,
    metadata: Object.freeze({ legacy }),
  });
}
