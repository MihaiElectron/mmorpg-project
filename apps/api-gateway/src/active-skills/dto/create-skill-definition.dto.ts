import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SKILL_EFFECT_TYPES,
  SKILL_KEY_PATTERN,
  SKILL_RESOURCE_TYPES,
  SKILL_TARGET_MODES,
  SkillEffectType,
  SkillResourceType,
  SkillTargetMode,
} from '../active-skills.constants';

/**
 * Création d'une SkillDefinition (POST /admin/skill-definitions).
 *
 * `key` et `name` requis ; tout le reste optionnel (les colonnes portent des
 * DEFAULT en base). `requiredMasteries` et `scaling` sont validés comme objets
 * ici (structure numérique fine vérifiée dans le service).
 *
 * Le ValidationPipe global (whitelist + forbidNonWhitelisted, main.ts) rejette
 * tout champ inconnu.
 */
export class CreateSkillDefinitionDto {
  @IsString()
  @MaxLength(64)
  @Matches(SKILL_KEY_PATTERN, {
    message: 'key doit être en minuscules, chiffres ou underscore ([a-z0-9_]).',
  })
  key: string;

  @IsString()
  @MaxLength(256)
  name: string;

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

  @IsOptional()
  @IsObject()
  scaling?: Record<string, unknown>;
}
