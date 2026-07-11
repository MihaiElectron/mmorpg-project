import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Format stable des clés de maîtrise : minuscules, chiffres, underscores.
 * Même contrat que SKILL_KEY_PATTERN — la key est référencée en copie string
 * par skills/items/recettes et ne doit jamais être ambiguë ni renommée.
 */
export const MASTERY_KEY_PATTERN = /^[a-z0-9_]+$/;

/**
 * Création d'une MasteryDefinition (POST /admin/mastery-definitions).
 *
 * `key` et `name` requis ; tout le reste optionnel (les colonnes portent des
 * DEFAULT en base : category 'general', maxLevel 100, baseXpPerLevel 100,
 * xpCurveExponent 1.5, enabled true).
 *
 * Le ValidationPipe global (whitelist + forbidNonWhitelisted, main.ts) rejette
 * tout champ inconnu.
 */
export class CreateMasteryDefinitionDto {
  @IsString()
  @MaxLength(64)
  @Matches(MASTERY_KEY_PATTERN, {
    message: 'key doit être en minuscules, chiffres ou underscore ([a-z0-9_]).',
  })
  key: string;

  @IsString()
  @MaxLength(256)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  baseXpPerLevel?: number;

  // Borne haute défensive : un exposant extrême rendrait nextLevelXp absurde
  // (base × level^exp). La formule elle-même reste serveur (MasteriesService).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(10)
  xpCurveExponent?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /**
   * Effets contextuels V1-D-A. Le DTO valide seulement "objet" ; la structure
   * interne (clés whitelistées, bornes) est validée par le service via
   * `sanitizeMasteryEffects` — une structure non supportée est rejetée en 400.
   */
  @IsOptional()
  @IsObject()
  effects?: Record<string, unknown>;
}
