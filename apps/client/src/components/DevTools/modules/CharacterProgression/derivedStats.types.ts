// Miroir client de DerivedStatDefinition (backend derived-stats/). Le
// serveur reste la seule autorité de calcul — ce module affiche/édite la
// config, ne calcule jamais de dérivée côté client (voir DerivedStatsPreview).

export type DerivedStatCategory =
  | "resources"
  | "offensive"
  | "defensive"
  | "elemental_resistance"
  | "mobility_control"
  | "social_threat";

export interface DerivedStatDefinitionDto {
  key: string;
  label: string;
  category: DerivedStatCategory;
  baseValue: number;
  rawStatSource: string | null;
  primaryCoefficients: Record<string, number>;
  minValue: number | null;
  maxValue: number | null;
  displayOrder: number;
  enabled: boolean;
}

export interface UpdateDerivedStatDefinitionPayload {
  label?: string;
  category?: DerivedStatCategory;
  baseValue?: number;
  primaryCoefficients?: Record<string, number>;
  minValue?: number | null;
  maxValue?: number | null;
  displayOrder?: number;
  enabled?: boolean;
}

export interface PreviewDerivedStatsPayload {
  primaryStats?: Record<string, number>;
  rawStats?: { maxHealth?: number; attack?: number; defense?: number };
  draftDefinitions?: Record<string, unknown>[];
}

export const DERIVED_STAT_CATEGORY_LABELS: { key: DerivedStatCategory; label: string }[] = [
  { key: "resources", label: "Ressources" },
  { key: "offensive", label: "Offensif" },
  { key: "defensive", label: "Défensif" },
  { key: "elemental_resistance", label: "Résistances élémentaires" },
  { key: "mobility_control", label: "Mobilité / contrôle" },
  { key: "social_threat", label: "Social / menace" },
];

/** Les 10 stats primaires — pour la validation client (soft) des coefficients. */
export const PRIMARY_STAT_KEYS = [
  "strength",
  "vitality",
  "endurance",
  "agility",
  "dexterity",
  "intelligence",
  "wisdom",
  "spirit",
  "willpower",
  "charisma",
] as const;

/**
 * Dérivées système requises par le combat V1 — jamais désactivables
 * (miroir de CRITICAL_DERIVED_STAT_KEYS backend, derived-stats.constants.ts).
 * Coefficients/baseValue/min/max restent librement modifiables ; seule la
 * checkbox "enabled" est verrouillée pour ces clés côté DevTools.
 */
export const CRITICAL_DERIVED_STAT_KEYS = ["maxHealth", "physicalAttack", "defense"] as const;
