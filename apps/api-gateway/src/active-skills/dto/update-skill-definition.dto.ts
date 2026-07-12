import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SKILL_DAMAGE_TYPES,
  SKILL_EFFECT_TYPES,
  SKILL_KINDS,
  SKILL_RESOURCE_TYPES,
  SKILL_TARGET_MODES,
  SkillDamageType,
  SkillEffectType,
  SkillKind,
  SkillResourceType,
  SkillTargetMode,
} from '../active-skills.constants';

/**
 * Patch partiel d'une SkillDefinition (PATCH /admin/skill-definitions/:key).
 *
 * `key` volontairement absent : la clé est immuable après création (référence
 * runtime stable). Tous les champs sont optionnels ; la validation numérique/
 * enum est identique à la création.
 */
export class UpdateSkillDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  iconAssetPath?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(SKILL_KINDS)
  skillKind?: SkillKind;

  @IsOptional()
  @IsBoolean()
  autoUnlock?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  requiredLevel?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  requiredClass?: string | null;

  @IsOptional()
  @IsObject()
  requiredMasteries?: Record<string, number>;

  /**
   * Lien explicite skill → arme (V1-D-Skills-A). String libre comme
   * `item.weaponType` ; null/vide = skill non lié à une arme. Normalisé
   * (trim, '' → null) et validé ([a-z0-9_]) par le service.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  weaponType?: string | null;

  @IsOptional()
  @IsIn(SKILL_RESOURCE_TYPES)
  resourceType?: SkillResourceType | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  resourceCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  cooldownMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  castTimeMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rangeWU?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  radiusWU?: number;

  @IsOptional()
  @IsIn(SKILL_TARGET_MODES)
  targetMode?: SkillTargetMode;

  @IsOptional()
  @IsIn(SKILL_EFFECT_TYPES)
  effectType?: SkillEffectType;

  /** Type de dégâts (V4-B) : `physical` (défaut) ou `raw`. Ignoré pour un soin. */
  @IsOptional()
  @IsIn(SKILL_DAMAGE_TYPES)
  damageType?: SkillDamageType;

  @IsOptional()
  @IsObject()
  scaling?: Record<string, unknown>;
}
