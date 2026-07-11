// Types et helpers PURS du module Studio « Stats secondaires » (V3-A).
// Miroir du contrat backend DerivedStatDefinition étendu (masteryEligible,
// allowedModifierModes, runtimeStatus, description). Le serveur reste la
// seule autorité de calcul — ce module édite la CONFIGURATION, ne calcule
// jamais une stat côté client.

import {
  DERIVED_STAT_CATEGORY_LABELS,
  PRIMARY_STAT_KEYS,
  type DerivedStatCategory,
} from "../CharacterProgression/derivedStats.types";

export { DERIVED_STAT_CATEGORY_LABELS, PRIMARY_STAT_KEYS };
export type { DerivedStatCategory };

export type DerivedStatRuntimeStatus = "implemented" | "calculatedOnly" | "notHooked";
export type DerivedStatModifierMode = "percentPerLevel" | "flatPerLevel";

export const RUNTIME_STATUS_OPTIONS: {
  key: DerivedStatRuntimeStatus;
  label: string;
  help: string;
}[] = [
  {
    key: "implemented",
    label: "implemented",
    help: "Calculée et consommée par au moins un hook runtime.",
  },
  {
    key: "calculatedOnly",
    label: "calculatedOnly",
    help: "Calculée/visible mais pas forcément utilisée en jeu.",
  },
  {
    key: "notHooked",
    label: "notHooked",
    help: "Définie mais sans effet gameplay.",
  },
];

export const MODIFIER_MODE_OPTIONS: { key: DerivedStatModifierMode; label: string }[] = [
  { key: "percentPerLevel", label: "% par niveau" },
  { key: "flatPerLevel", label: "valeur fixe par niveau" },
];

/** DTO complet (V3-A) — surensemble du DTO CharacterProgression. */
export interface DerivedStatFullDto {
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
  masteryEligible: boolean;
  allowedModifierModes: DerivedStatModifierMode[];
  runtimeStatus: DerivedStatRuntimeStatus;
  description: string | null;
}

// ── Brouillon d'édition (champs contrôlés, numériques en string) ─────────────

export interface DerivedStatDraft {
  key: string;
  label: string;
  category: DerivedStatCategory;
  enabled: boolean;
  baseValue: string;
  minValue: string;
  maxValue: string;
  coefficients: Record<string, string>;
  masteryEligible: boolean;
  allowedModifierModes: DerivedStatModifierMode[];
  runtimeStatus: DerivedStatRuntimeStatus;
  description: string;
}

function emptyCoefficients(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PRIMARY_STAT_KEYS) out[k] = "";
  return out;
}

export function emptyDerivedStatDraft(): DerivedStatDraft {
  return {
    key: "",
    label: "",
    category: "offensive",
    enabled: true,
    baseValue: "0",
    minValue: "0",
    maxValue: "",
    coefficients: emptyCoefficients(),
    masteryEligible: false,
    allowedModifierModes: [],
    runtimeStatus: "calculatedOnly",
    description: "",
  };
}

/** Brouillon depuis une définition serveur. */
export function draftFromDerivedStat(def: DerivedStatFullDto): DerivedStatDraft {
  const coefficients = emptyCoefficients();
  for (const [k, v] of Object.entries(def.primaryCoefficients ?? {})) {
    if (k in coefficients && typeof v === "number") coefficients[k] = String(v);
  }
  return {
    key: def.key,
    label: def.label ?? "",
    category: def.category,
    enabled: def.enabled ?? true,
    baseValue: def.baseValue != null ? String(def.baseValue) : "0",
    minValue: def.minValue != null ? String(def.minValue) : "",
    maxValue: def.maxValue != null ? String(def.maxValue) : "",
    coefficients,
    masteryEligible: def.masteryEligible ?? false,
    allowedModifierModes: def.allowedModifierModes ?? [],
    runtimeStatus: def.runtimeStatus ?? "calculatedOnly",
    description: def.description ?? "",
  };
}

// ── Validation (aide UX seulement — le serveur reste validateur final) ──────

const KEY_PATTERN = /^[a-z][a-zA-Z0-9]{1,63}$/;

export function validateDerivedStatDraft(
  draft: DerivedStatDraft,
  mode: "create" | "edit",
): string | null {
  if (mode === "create") {
    if (draft.key.trim() === "") return "La key est requise.";
    if (!KEY_PATTERN.test(draft.key.trim())) {
      return "Key invalide : camelCase ([a-z][a-zA-Z0-9]*, 2–64 caractères).";
    }
  }
  if (draft.label.trim() === "") return "Le label est requis.";
  if ((draft.category as string).trim() === "") return "La catégorie est requise.";

  const numeric = (raw: string, field: string): number | null | string => {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return `${field} doit être un nombre fini.`;
    return n;
  };
  const base = numeric(draft.baseValue, "baseValue");
  if (typeof base === "string") return base;
  if (base === null) return "baseValue est requis (0 par défaut).";
  const min = numeric(draft.minValue, "minValue");
  if (typeof min === "string") return min;
  const max = numeric(draft.maxValue, "maxValue");
  if (typeof max === "string") return max;
  if (min != null && max != null && min > max) {
    return "minValue ne peut pas dépasser maxValue.";
  }
  for (const [k, raw] of Object.entries(draft.coefficients)) {
    if (raw.trim() === "") continue;
    if (!Number.isFinite(Number(raw))) return `Coefficient "${k}" invalide (nombre requis).`;
  }
  return null;
}

// ── Payloads (jamais de calcul de stat — configuration pure) ────────────────

function coefficientsPayload(draft: DerivedStatDraft): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, raw] of Object.entries(draft.coefficients)) {
    if (raw.trim() === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n !== 0) out[k] = n;
  }
  return out;
}

function numberOrNull(raw: string): number | null {
  return raw.trim() === "" ? null : Number(raw);
}

export interface CreateDerivedStatPayload {
  key: string;
  label: string;
  category: DerivedStatCategory;
  enabled: boolean;
  baseValue: number;
  minValue: number | null;
  maxValue: number | null;
  primaryCoefficients: Record<string, number>;
  masteryEligible: boolean;
  allowedModifierModes: DerivedStatModifierMode[];
  runtimeStatus: DerivedStatRuntimeStatus;
  description: string | null;
}

export type UpdateDerivedStatPayload = Partial<Omit<CreateDerivedStatPayload, "key">>;

/** Payload de création complet (brouillon supposé validé). */
export function buildCreateDerivedStatPayload(draft: DerivedStatDraft): CreateDerivedStatPayload {
  return {
    key: draft.key.trim(),
    label: draft.label.trim(),
    category: draft.category,
    enabled: draft.enabled,
    baseValue: Number(draft.baseValue),
    minValue: numberOrNull(draft.minValue),
    maxValue: numberOrNull(draft.maxValue),
    primaryCoefficients: coefficientsPayload(draft),
    masteryEligible: draft.masteryEligible,
    allowedModifierModes: draft.allowedModifierModes,
    runtimeStatus: draft.runtimeStatus,
    description: draft.description.trim() === "" ? null : draft.description.trim(),
  };
}

/** Patch partiel : uniquement les champs modifiés — jamais `key` (immuable). */
export function buildUpdateDerivedStatPayload(
  def: DerivedStatFullDto,
  draft: DerivedStatDraft,
): UpdateDerivedStatPayload {
  const full = buildCreateDerivedStatPayload({ ...draft, key: def.key });
  const patch: UpdateDerivedStatPayload = {};
  if (full.label !== def.label) patch.label = full.label;
  if (full.category !== def.category) patch.category = full.category;
  if (full.enabled !== def.enabled) patch.enabled = full.enabled;
  if (full.baseValue !== def.baseValue) patch.baseValue = full.baseValue;
  if (full.minValue !== (def.minValue ?? null)) patch.minValue = full.minValue;
  if (full.maxValue !== (def.maxValue ?? null)) patch.maxValue = full.maxValue;
  if (JSON.stringify(full.primaryCoefficients) !== JSON.stringify(def.primaryCoefficients ?? {})) {
    patch.primaryCoefficients = full.primaryCoefficients;
  }
  if (full.masteryEligible !== (def.masteryEligible ?? false)) {
    patch.masteryEligible = full.masteryEligible;
  }
  if (
    JSON.stringify([...full.allowedModifierModes].sort()) !==
    JSON.stringify([...(def.allowedModifierModes ?? [])].sort())
  ) {
    patch.allowedModifierModes = full.allowedModifierModes;
  }
  if (full.runtimeStatus !== (def.runtimeStatus ?? "calculatedOnly")) {
    patch.runtimeStatus = full.runtimeStatus;
  }
  if (full.description !== (def.description ?? null)) patch.description = full.description;
  return patch;
}
