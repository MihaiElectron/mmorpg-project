import { MasteryDefinition } from '../entities/mastery-definition.entity';

export type MasteryDefinitionCapability =
  | 'mastery_definition'   // identité et paramètres de la définition de la mastery
  | 'mastery_progression'  // curve XP, maxLevel, formule de progression
  | 'validation';          // règles de cohérence exposables au Studio

export interface MasteryDefinitionMetadata {
  readonly name: string;
  readonly masteryCategory: string;
  readonly maxLevel: number;
  readonly baseXpPerLevel: number;
  readonly xpCurveExponent: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MasteryDefinitionWorldObject {
  readonly kind: 'definition';
  readonly category: 'mastery';
  readonly id: string;
  /** Clé fonctionnelle permanente (ex: "woodcutting"). */
  readonly type: string;
  readonly mapId: null;
  readonly position: null;
  /** "enabled" ou "disabled" — reflète MasteryDefinition.enabled. */
  readonly state: 'enabled' | 'disabled';
  readonly capabilities: readonly MasteryDefinitionCapability[];
  readonly metadata: MasteryDefinitionMetadata;
}

const MASTERY_DEFINITION_CAPABILITIES: readonly MasteryDefinitionCapability[] = Object.freeze([
  'mastery_definition',
  'mastery_progression',
  'validation',
]);

export function toMasteryDefinitionWorldObject(sd: MasteryDefinition): MasteryDefinitionWorldObject {
  return Object.freeze({
    kind: 'definition',
    category: 'mastery',
    id: sd.id,
    type: sd.key,
    mapId: null,
    position: null,
    state: sd.enabled ? 'enabled' : 'disabled',
    capabilities: MASTERY_DEFINITION_CAPABILITIES,
    metadata: Object.freeze({
      name: sd.name,
      masteryCategory: sd.category,
      maxLevel: sd.maxLevel,
      baseXpPerLevel: sd.baseXpPerLevel,
      xpCurveExponent: sd.xpCurveExponent,
      createdAt: sd.createdAt,
      updatedAt: sd.updatedAt,
    }),
  });
}
