import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  DerivedStatCategory,
  DerivedStatModifierMode,
  DerivedStatRuntimeStatus,
  DERIVED_STAT_MODIFIER_MODES,
  DERIVED_STAT_RUNTIME_STATUSES,
} from '../entities/derived-stat-definition.entity';
import { DERIVED_STAT_CATEGORIES } from '../derived-stats.constants';

const CATEGORY_KEYS = DERIVED_STAT_CATEGORIES.map((c) => c.key);

/**
 * Patch partiel d'une DerivedStatDefinition (PATCH admin/derived-stat-definitions/:key).
 * `primaryCoefficients` est validé manuellement dans le service (clés = stats
 * primaires autorisées, valeurs numériques) — pas de DTO imbriqué dynamique.
 */
export class UpdateDerivedStatDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsIn(CATEGORY_KEYS)
  category?: DerivedStatCategory;

  @IsOptional()
  @IsNumber()
  baseValue?: number;

  @IsOptional()
  @IsObject()
  primaryCoefficients?: Record<string, number>;

  @IsOptional()
  @IsNumber()
  minValue?: number | null;

  @IsOptional()
  @IsNumber()
  maxValue?: number | null;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  // ── Métadonnées Studio « Stats secondaires » (V3-A) ────────────────────────

  @IsOptional()
  @IsBoolean()
  masteryEligible?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(DERIVED_STAT_MODIFIER_MODES, { each: true })
  allowedModifierModes?: DerivedStatModifierMode[];

  @IsOptional()
  @IsIn(DERIVED_STAT_RUNTIME_STATUSES)
  runtimeStatus?: DerivedStatRuntimeStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
