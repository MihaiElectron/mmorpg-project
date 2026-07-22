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
  SKILL_ATTACK_DEFENSE_KINDS,
  SKILL_DAMAGE_TYPES,
  SKILL_EFFECT_TYPES,
  SKILL_KEY_PATTERN,
  SKILL_KINDS,
  SKILL_MAGIC_SCHOOLS,
  SKILL_RESOURCE_TYPES,
  SKILL_TARGET_MODES,
  MagicSchool,
  SkillAttackDefenseKind,
  SkillDamageType,
  SkillEffectType,
  SkillKind,
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

  /**
   * Nature défensive (V6-B5) : `physical` (défaut, parable) ou `magic` (sort pur
   * non parable). Axe distinct de `damageType`. Aucun effet combat en Lot 1.
   */
  @IsOptional()
  @IsIn(SKILL_ATTACK_DEFENSE_KINDS)
  attackDefenseKind?: SkillAttackDefenseKind;

  /**
   * École magique (ADR-0022 — lot fondation) : l'une des six écoles ou `null`
   * (skill sans école). `@IsOptional` autorise l'absence ET `null` (remise à
   * `null` explicite). Cohérence croisée avec `attackDefenseKind` vérifiée
   * serveur. Aucun effet combat dans ce lot.
   */
  @IsOptional()
  @IsIn(SKILL_MAGIC_SCHOOLS)
  magicSchool?: MagicSchool | null;

  /**
   * Flags défensifs (Lot A) — serveur-autoritaires. Défauts : esquive/blocage
   * autorisés, parade désactivée. Un skill n'est parable que si `canBeParried: true`.
   */
  @IsOptional()
  @IsBoolean()
  canBeDodged?: boolean;

  @IsOptional()
  @IsBoolean()
  canBeBlocked?: boolean;

  @IsOptional()
  @IsBoolean()
  canBeParried?: boolean;

  /**
   * Critiquable — critique autorisé UNIQUEMENT pour des dégâts physiques
   * (`effectType = damage` + `damageType = physical`). Refusé serveur pour
   * magic/raw/soin. Défaut entité `false`.
   */
  @IsOptional()
  @IsBoolean()
  canCrit?: boolean;

  @IsOptional()
  @IsObject()
  scaling?: Record<string, unknown>;
}
