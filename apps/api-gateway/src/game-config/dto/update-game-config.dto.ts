import { IsInt, IsNumber, IsOptional, Min, Max } from 'class-validator';

/**
 * DTO de mise à jour partielle des règles globales de progression (ADR-0018).
 *
 * Tous les champs sont optionnels : le PATCH/preview fusionne le brouillon
 * avec la config courante. La ValidationPipe globale (whitelist +
 * forbidNonWhitelisted) rejette tout champ non déclaré ici.
 *
 * Ne borne pas l'équilibrage final (valeurs libres au design) : uniquement
 * des garde-fous de cohérence (valeurs positives, exposants finis).
 */
export class UpdateGameConfigDto {
  // ── XP — modèle actif par tranches multiplicatives ──
  @IsOptional()
  @IsInt()
  @Min(1)
  startingXp?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  xpMultiplierLevel1To10?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  xpMultiplierLevel11To30?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  xpMultiplierLevel31To60?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  xpMultiplierLevel61To120?: number;

  // ── XP — champs LEGACY (ancien modèle base × level^exp × coeff).
  //     Conservés pour compatibilité ; sans effet sur le calcul de progression
  //     depuis le passage au modèle par tranches. Ne pas retirer ici. ──
  @IsOptional()
  @IsInt()
  @Min(1)
  characterBaseXpPerLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(10)
  characterXpCurveExponent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1000)
  characterXpCoefficient?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1000)
  highLevelXpMultiplier?: number;

  // ── Niveaux ──
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  characterMaxLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  characterCurrentLevelCap?: number;

  // ── Points de stats ──
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  statPointsAtLevelOne?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  statPointsPerLevel?: number;

  // ── Masteries ──
  @IsOptional()
  @IsInt()
  @Min(1)
  masteryNaturalCap?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  masteryOvercap?: number;
}
