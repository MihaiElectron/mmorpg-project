import { IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { DerivedStatCategory } from '../entities/derived-stat-definition.entity';
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
}
