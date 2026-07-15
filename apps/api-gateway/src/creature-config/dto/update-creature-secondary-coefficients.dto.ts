import { IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * DTO de mise à jour partielle des coefficients de dérivation des secondaires
 * créature (V6-B2.5 Lot 3).
 *
 * Tous les champs sont optionnels : le PATCH fusionne le patch avec la config
 * courante (champs absents préservés). La ValidationPipe globale (whitelist +
 * forbidNonWhitelisted) rejette toute clé inconnue. `@IsNumber()` (sans
 * `allowNaN`/`allowInfinity`) refuse NaN/Infinity et les non-nombres ; `@Min`/
 * `@Max` posent les garde-fous d'équilibrage (jamais négatif ; plafond par champ).
 */
export class UpdateCreatureSecondaryCoefficientsDto {
  // ── Actifs en combat ──────────────────────────────────────────────────────
  @IsOptional() @IsNumber() @Min(0) @Max(20)
  attackPowerPerStrength?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(20)
  defenseTotalPerEndurance?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(10)
  accuracyPerDexterity?: number;

  // ── Calculés, non actifs en défense ───────────────────────────────────────
  @IsOptional() @IsNumber() @Min(0) @Max(5)
  dodgePerAgility?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(5)
  blockPerEndurance?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(5)
  blockPerStrength?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  blockReductionPercent?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(5)
  parryPerStrength?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(5)
  parryPerDexterity?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(10)
  counterPerDexterity?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(10)
  counterPerAgility?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(10)
  counterPerIntelligence?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1000)
  maxHealthPerVitality?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  secondaryChanceCap?: number;
}
