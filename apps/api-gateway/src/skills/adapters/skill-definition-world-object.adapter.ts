import { SkillDefinition } from '../entities/skill-definition.entity';

export type SkillDefinitionCapability =
  | 'skill_definition'   // identité et paramètres de la définition du skill
  | 'skill_progression'  // curve XP, maxLevel, formule de progression
  | 'validation';        // règles de cohérence exposables au Studio

export interface SkillDefinitionMetadata {
  readonly name: string;
  readonly skillCategory: string;
  readonly maxLevel: number;
  readonly baseXpPerLevel: number;
  readonly xpCurveExponent: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SkillDefinitionWorldObject {
  readonly kind: 'definition';
  readonly category: 'skill';
  readonly id: string;
  /** Clé fonctionnelle permanente (ex: "woodcutting"). */
  readonly type: string;
  readonly mapId: null;
  readonly position: null;
  /** "enabled" ou "disabled" — reflète SkillDefinition.enabled. */
  readonly state: 'enabled' | 'disabled';
  readonly capabilities: readonly SkillDefinitionCapability[];
  readonly metadata: SkillDefinitionMetadata;
}

const SKILL_DEFINITION_CAPABILITIES: readonly SkillDefinitionCapability[] = Object.freeze([
  'skill_definition',
  'skill_progression',
  'validation',
]);

export function toSkillDefinitionWorldObject(sd: SkillDefinition): SkillDefinitionWorldObject {
  return Object.freeze({
    kind: 'definition',
    category: 'skill',
    id: sd.id,
    type: sd.key,
    mapId: null,
    position: null,
    state: sd.enabled ? 'enabled' : 'disabled',
    capabilities: SKILL_DEFINITION_CAPABILITIES,
    metadata: Object.freeze({
      name: sd.name,
      skillCategory: sd.category,
      maxLevel: sd.maxLevel,
      baseXpPerLevel: sd.baseXpPerLevel,
      xpCurveExponent: sd.xpCurveExponent,
      createdAt: sd.createdAt,
      updatedAt: sd.updatedAt,
    }),
  });
}
