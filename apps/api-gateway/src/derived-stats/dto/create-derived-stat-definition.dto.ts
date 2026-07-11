import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
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
 * Format des clés de dérivées : camelCase (même contrat que les 24 clés
 * existantes — "criticalChance", "maxHealth"…). Immuable après création :
 * la clé est le PK et le nom du champ exposé dans `stats.derived`.
 */
export const DERIVED_STAT_KEY_PATTERN = /^[a-z][a-zA-Z0-9]{1,63}$/;

/**
 * Création d'une DerivedStatDefinition (POST /admin/derived-stat-definitions,
 * Studio « Stats secondaires » V3-A).
 *
 * `key`, `label` et `category` requis ; le reste optionnel avec les defaults
 * entity (baseValue 0, coefficients {}, enabled true, masteryEligible false,
 * allowedModifierModes [], runtimeStatus calculatedOnly). `rawStatSource`
 * volontairement absent : réservé aux 3 dérivées combat historiques.
 * `primaryCoefficients` est validé finement dans le service.
 */
export class CreateDerivedStatDefinitionDto {
  @IsString()
  @Matches(DERIVED_STAT_KEY_PATTERN, {
    message: 'key doit être en camelCase ([a-z][a-zA-Z0-9]*, 2–64 caractères).',
  })
  key: string;

  @IsString()
  @MaxLength(80)
  label: string;

  @IsIn(CATEGORY_KEYS)
  category: DerivedStatCategory;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  baseValue?: number;

  @IsOptional()
  @IsNumber()
  minValue?: number | null;

  @IsOptional()
  @IsNumber()
  maxValue?: number | null;

  @IsOptional()
  @IsObject()
  primaryCoefficients?: Record<string, number>;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

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
