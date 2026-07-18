// Miroir des DTO serveur (creature-derived-configuration.dto.ts). Aucune donnée
// inventée côté client : tout provient du contrat serveur.

export type DerivedOverrideState = "none" | "coefficients" | "empty";
export type DerivedCoefficientSource = "template" | "global" | "catalog";

export interface CoefficientEntry {
  primaryStatKey: string;
  coefficient: number;
}

export interface DerivedStatConfigEntry {
  derivedStatKey: string;
  overrideState: DerivedOverrideState;
  /** Coefficients explicitement enregistrés (null = aucun override). */
  explicitCoefficients: CoefficientEntry[] | null;
  /** Coefficients effectifs (override ou fallback). */
  effectiveCoefficients: CoefficientEntry[];
  source: DerivedCoefficientSource;
  baseSource: string | null;
  label: string | null;
  category: string | null;
}

export interface ScalarParamConfigEntry {
  scalarParamKey: string;
  explicitValue: number | null;
  effectiveValue: number;
  source: "template" | "global";
}

export interface CreatureDerivedConfiguration {
  templateId: number;
  templateKey: string;
  derivedStats: DerivedStatConfigEntry[];
  scalarParams: ScalarParamConfigEntry[];
  catalog: {
    primaryStatKeys: string[];
    scalarParamKeys: string[];
    derivedStatKeys: string[];
  };
}

// ── Payload PUT (remplacement complet) ──────────────────────────────────────

export interface DerivedOverridePayload {
  derivedStatKey: string;
  coefficients: CoefficientEntry[];
}

export interface ScalarOverridePayload {
  scalarParamKey: string;
  value: number;
}

export interface ReplaceDerivedConfigurationPayload {
  derivedOverrides: DerivedOverridePayload[];
  scalarOverrides: ScalarOverridePayload[];
}

// ── Snapshot runtime d'une instance ─────────────────────────────────────────

export interface DerivedContribution {
  primaryStatKey: string;
  primaryValue: number;
  coefficient: number;
  contribution: number;
}

export interface DerivedStatTrace {
  derivedStatKey: string;
  baseValue: number;
  baseSource: string | null;
  contributions: DerivedContribution[];
  computedFromCoefficients: number;
  modifiers: number;
  finalValue: number;
  source: DerivedCoefficientSource;
  overrideState: DerivedOverrideState;
}

export interface CreatureRuntimeSnapshot {
  instanceId: string;
  templateId: number;
  templateKey: string;
  state: string;
  currentHealth: number;
  maxHealth: number;
  primaryStats: Record<string, number>;
  derivedStats: Record<string, number>;
  traces: DerivedStatTrace[];
}
