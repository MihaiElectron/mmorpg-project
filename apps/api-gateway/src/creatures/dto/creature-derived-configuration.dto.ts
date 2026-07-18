import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO de `PUT /admin/creatures/templates/:key/derived-configuration` — remplace
 * INTÉGRALEMENT la configuration d'overrides d'un template (ADR-0021).
 *
 * Validation STRUCTURELLE ici (types, `@IsNumber` rejette NaN/Infinity par
 * défaut) ; la validation CANONIQUE (clé dérivée ∈ catalogue, clé primaire ∈
 * primaires, clé scalaire ∈ liste serveur, doublons) est faite dans le service
 * (nécessite le catalogue). `forbidNonWhitelisted` rejette tout champ inconnu.
 */
export class DerivedCoefficientEntryDto {
  @IsString()
  primaryStatKey: string;

  /** Coefficient fini (négatif/zéro autorisés). NaN/Infinity rejetés par `@IsNumber`. */
  @IsNumber()
  coefficient: number;
}

export class DerivedOverrideEntryDto {
  @IsString()
  derivedStatKey: string;

  /** Map du template (vide `[]` = override vide volontaire). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DerivedCoefficientEntryDto)
  coefficients: DerivedCoefficientEntryDto[];
}

export class ScalarOverrideEntryDto {
  @IsString()
  scalarParamKey: string;

  @IsNumber()
  value: number;
}

// ── Types de réponse (serveur → Studio) ─────────────────────────────────────

export type DerivedOverrideState = 'none' | 'coefficients' | 'empty';
export type DerivedCoefficientSource = 'template' | 'global' | 'catalog';

export interface CoefficientEntryDto {
  primaryStatKey: string;
  coefficient: number;
}

/** Entrée de configuration d'une dérivée (GET) — distingue les 3 états d'override. */
export interface DerivedStatConfigEntryDto {
  derivedStatKey: string;
  /** `none` = aucun override ; `coefficients` = override non vide ; `empty` = override vide volontaire. */
  overrideState: DerivedOverrideState;
  /** Coefficients EXPLICITEMENT enregistrés sur le template (null si aucun override). */
  explicitCoefficients: CoefficientEntryDto[] | null;
  /** Coefficients EFFECTIVEMENT utilisés au runtime (override ou fallback). */
  effectiveCoefficients: CoefficientEntryDto[];
  /** Provenance des coefficients effectifs. */
  source: DerivedCoefficientSource;
  /** Source de la valeur de base (`baseAttack`/`baseArmor`/`baseHealth`/`accuracy`/`catalog`/null). */
  baseSource: string | null;
  /** Métadonnées catalogue utiles à l'éditeur. */
  label: string | null;
  category: string | null;
}

export interface ScalarParamConfigEntryDto {
  scalarParamKey: string;
  explicitValue: number | null;
  effectiveValue: number;
  source: 'template' | 'global';
}

export interface CreatureDerivedConfigurationDto {
  templateId: number;
  templateKey: string;
  derivedStats: DerivedStatConfigEntryDto[];
  scalarParams: ScalarParamConfigEntryDto[];
  /** Catalogue serveur — l'éditeur ne maintient aucune liste en dur. */
  catalog: {
    primaryStatKeys: string[];
    scalarParamKeys: string[];
    derivedStatKeys: string[];
  };
}

// ── Snapshot runtime d'une instance (GET) ────────────────────────────────────

export interface DerivedContributionDto {
  primaryStatKey: string;
  primaryValue: number;
  coefficient: number;
  contribution: number;
}

/** Trace GÉNÉRIQUE d'une dérivée (identique pour combat, PV max et résistances). */
export interface DerivedStatTraceDto {
  derivedStatKey: string;
  baseValue: number;
  baseSource: string | null;
  contributions: DerivedContributionDto[];
  /** Somme base + contributions primaires (avant modificateurs/caps). */
  computedFromCoefficients: number;
  /** Modificateurs génériques déjà supportés + effets de caps/plancher (final − computed). */
  modifiers: number;
  /** Valeur finale autoritaire (resolver runtime). */
  finalValue: number;
  source: DerivedCoefficientSource;
  overrideState: DerivedOverrideState;
}

export interface CreatureRuntimeSnapshotDto {
  instanceId: string;
  templateId: number;
  templateKey: string;
  state: string;
  currentHealth: number;
  maxHealth: number;
  primaryStats: Record<string, number>;
  derivedStats: Record<string, number>;
  traces: DerivedStatTraceDto[];
}

export class ReplaceCreatureDerivedConfigurationDto {
  /** Overrides de coefficients par dérivée. Dérivée absente = suppression (fallback). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DerivedOverrideEntryDto)
  derivedOverrides: DerivedOverrideEntryDto[];

  /** Overrides scalaires. Scalaire absent = suppression (fallback global). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScalarOverrideEntryDto)
  scalarOverrides: ScalarOverrideEntryDto[];
}
