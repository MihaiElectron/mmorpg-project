// Types et helpers PURS du module Studio « Maîtrises / Effets » (V2).
// Miroir lecture seule du contrat backend `mastery_definition.effects`
// (ADR-0020, modèle générique modifiers[]). Le frontend construit la
// CONFIGURATION et l'affiche — il ne calcule jamais un bonus ni une
// éligibilité : formule, bornes et clamps sont serveur.

export interface MasteryEffectsContext {
  weaponType?: string;
}

export type MasteryModifierMode = "percentPerLevel" | "flatPerLevel";

export interface MasteryStatModifier {
  stat: string;
  mode: MasteryModifierMode;
  value: number;
}

/** Structure persistée dans `mastery_definition.effects`. `{}` = aucun effet. */
export interface MasteryEffects {
  context?: MasteryEffectsContext;
  modifiers?: MasteryStatModifier[];
  /** Legacy V1 — toléré en lecture, jamais généré par ce module. */
  combat?: { damagePercentPerLevel?: number };
}

export interface MasteryDefinitionDto {
  key: string;
  name: string;
  category: string;
  enabled: boolean;
  effects: MasteryEffects;
}

// ── Catalogue des stats ciblables : SOURCE SERVEUR UNIQUEMENT (V2-E) ─────────
// GET /admin/mastery-effect-targets — aucune liste de stats codée en dur ici.
// Si les targets ne chargent pas, l'UI bloque la sauvegarde (pas de fallback).

export type MasteryEffectRuntimeStatus = "implemented" | "calculatedOnly" | "notHooked";

export interface MasteryEffectTargetDto {
  key: string;
  label: string;
  category: string;
  allowedModes: MasteryModifierMode[];
  minValueByMode: Record<MasteryModifierMode, number>;
  maxValueByMode: Record<MasteryModifierMode, number>;
  runtimeStatus: MasteryEffectRuntimeStatus;
  description: string;
}

export interface MasteryEffectModeDto {
  key: MasteryModifierMode;
  label: string;
  description: string;
}

export interface MasteryEffectTargetsResponse {
  targets: MasteryEffectTargetDto[];
  modes: MasteryEffectModeDto[];
  /** Stats autorisées avec un contexte weaponType (règle serveur). */
  contextualStats: string[];
}

/** Bornes du champ value pour un target/mode serveur (fallback sûr si absent). */
export function valueBoundsFor(
  target: MasteryEffectTargetDto | undefined,
  mode: MasteryModifierMode,
): { min: number; max: number; step: number } {
  return {
    min: target?.minValueByMode?.[mode] ?? 0,
    max: target?.maxValueByMode?.[mode] ?? (mode === "percentPerLevel" ? 5 : 100),
    step: mode === "percentPerLevel" ? 0.25 : 1,
  };
}

/** Targets triés par catégorie puis label (ordre d'affichage du select). */
export function sortTargets(targets: MasteryEffectTargetDto[]): MasteryEffectTargetDto[] {
  return [...targets].sort((a, b) =>
    a.category !== b.category
      ? a.category.localeCompare(b.category)
      : a.label.localeCompare(b.label),
  );
}

// ── Brouillon d'édition des effets ──────────────────────────────────────────

/** Ligne du tableau de modificateurs (champs contrôlés, value en string). */
export interface ModifierRowDraft {
  stat: string;
  mode: MasteryModifierMode;
  value: string;
}

export interface MasteryEffectsDraft {
  /** "" = effet permanent (aucun contexte d'arme). */
  weaponType: string;
  modifiers: ModifierRowDraft[];
}

export function emptyModifierRow(): ModifierRowDraft {
  return { stat: "", mode: "percentPerLevel", value: "" };
}

/**
 * Brouillon depuis les effects chargés. `{}`/absent → brouillon vide.
 * Préséance V2 : si `modifiers[]` existe, le legacy
 * `combat.damagePercentPerLevel` est ignoré. Un effects purement legacy est
 * affiché comme une ligne physicalAttack / percentPerLevel (réécrit au format
 * V2 au save).
 */
export function draftFromMasteryEffects(
  effects: MasteryEffects | null | undefined,
): MasteryEffectsDraft {
  const modifiers: ModifierRowDraft[] = [];
  for (const m of effects?.modifiers ?? []) {
    if (!m || typeof m.stat !== "string") continue;
    modifiers.push({
      stat: m.stat,
      mode: m.mode === "flatPerLevel" ? "flatPerLevel" : "percentPerLevel",
      value: typeof m.value === "number" ? String(m.value) : "",
    });
  }
  if (modifiers.length === 0) {
    const legacy = effects?.combat?.damagePercentPerLevel;
    if (typeof legacy === "number" && Number.isFinite(legacy)) {
      modifiers.push({ stat: "physicalAttack", mode: "percentPerLevel", value: String(legacy) });
    }
  }
  return {
    weaponType: effects?.context?.weaponType ?? "",
    modifiers,
  };
}

/** true si la définition porte un effet configuré (`effects` non vide). */
export function hasActiveMasteryEffects(
  effects: MasteryEffects | null | undefined,
): boolean {
  return Object.keys(effects ?? {}).length > 0;
}

/**
 * Première erreur d'aide frontend, ou null. Un brouillon sans aucune ligne est
 * valide (= désactivation). Bornes et règle contextuelle proviennent du
 * SERVEUR (`targets`/`contextualStats`) — le serveur reste le validateur final.
 */
export function validateMasteryEffectsDraft(
  draft: MasteryEffectsDraft,
  targets: MasteryEffectTargetDto[],
  contextualStats: string[],
): string | null {
  const byKey = new Map(targets.map((t) => [t.key, t]));
  const hasContext = draft.weaponType.trim() !== "";
  for (const [index, row] of draft.modifiers.entries()) {
    if (row.stat.trim() === "") {
      return `Ligne ${index + 1} : choisissez une stat.`;
    }
    const target = byKey.get(row.stat);
    if (!target) {
      return `Ligne ${index + 1} : stat "${row.stat}" inconnue du serveur.`;
    }
    if (hasContext && !contextualStats.includes(row.stat)) {
      return `Ligne ${index + 1} : seule la stat ${contextualStats.join(", ")} est supportée avec un contexte weaponType pour le moment.`;
    }
    const n = Number(row.value);
    if (row.value.trim() === "" || !Number.isFinite(n)) {
      return `Ligne ${index + 1} : coefficient requis (nombre).`;
    }
    const { min, max } = valueBoundsFor(target, row.mode);
    if (n < min || n > max) {
      return `Ligne ${index + 1} : coefficient entre ${min} et ${max} (${row.mode}).`;
    }
  }
  return null;
}

/**
 * Payload `effects` exact envoyé au PATCH. Par construction :
 * - aucune ligne valide → `{}` = désactivation ;
 * - sinon `modifiers[]` (stat/mode/value uniquement, value en number) +
 *   `context.weaponType` si renseigné — jamais de clé legacy `combat`,
 *   jamais crit/stun/block/craft, jamais de bonus calculé.
 */
export function buildMasteryEffectsPayload(
  draft: MasteryEffectsDraft,
): MasteryEffects {
  const modifiers: MasteryStatModifier[] = draft.modifiers
    .filter((row) => row.stat.trim() !== "")
    .map((row) => ({
      stat: row.stat.trim(),
      mode: row.mode,
      value: Number(row.value),
    }));
  if (modifiers.length === 0) return {};

  const payload: MasteryEffects = { modifiers };
  const weaponType = draft.weaponType.trim();
  if (weaponType !== "") payload.context = { weaponType };
  return payload;
}

// ── Création d'une maîtrise (minimale — pas un CRUD générique) ───────────────

// Catégories proposées (select simple, combat par défaut). La colonne serveur
// reste un varchar libre — ce catalogue n'est pas une enum stricte.
export const MASTERY_CATEGORIES = [
  "combat",
  "gathering",
  "crafting",
  "exploration",
  "social",
  "leadership",
  "general",
] as const;

/** Brouillon de création — champs contrôlés (numériques en string). */
export interface CreateMasteryDefinitionDraft {
  key: string;
  name: string;
  category: string;
  maxLevel: string;
  baseXpPerLevel: string;
  xpCurveExponent: string;
  enabled: boolean;
}

/** Payload exact du POST /admin/mastery-definitions. */
export interface CreateMasteryDefinitionPayload {
  key: string;
  name: string;
  category: string;
  maxLevel: number;
  baseXpPerLevel: number;
  xpCurveExponent: number;
  enabled: boolean;
  effects: MasteryEffects;
}

/** Brouillon initial (defaults serveur, catégorie combat). */
export function emptyCreateMasteryDefinitionDraft(): CreateMasteryDefinitionDraft {
  return {
    key: "",
    name: "",
    category: "combat",
    maxLevel: "100",
    baseXpPerLevel: "100",
    xpCurveExponent: "1.5",
    enabled: true,
  };
}

const MASTERY_KEY_PATTERN = /^[a-z0-9_]+$/;

/**
 * Première erreur d'aide frontend, ou null. Aide UX seulement — le serveur
 * (DTO class-validator) reste le validateur final.
 */
export function validateCreateMasteryDefinitionDraft(
  draft: CreateMasteryDefinitionDraft,
): string | null {
  const key = draft.key.trim();
  if (key === "") return "La key est requise.";
  if (!MASTERY_KEY_PATTERN.test(key)) {
    return "Key invalide : minuscules, chiffres ou underscore ([a-z0-9_]).";
  }
  if (draft.name.trim() === "") return "Le nom est requis.";
  if (draft.category.trim() === "") return "La catégorie est requise.";
  const maxLevel = Number(draft.maxLevel);
  if (!Number.isInteger(maxLevel) || maxLevel < 1) {
    return "maxLevel doit être un entier >= 1.";
  }
  const baseXp = Number(draft.baseXpPerLevel);
  if (!Number.isInteger(baseXp) || baseXp < 1) {
    return "baseXpPerLevel doit être un entier >= 1.";
  }
  const exponent = Number(draft.xpCurveExponent);
  if (!Number.isFinite(exponent) || exponent <= 0) {
    return "xpCurveExponent doit être un nombre > 0.";
  }
  return null;
}

/**
 * Payload de création exact (brouillon supposé validé). `effects: {}` par
 * défaut : les effets se configurent ensuite dans la section d'édition.
 */
export function buildCreateMasteryDefinitionPayload(
  draft: CreateMasteryDefinitionDraft,
): CreateMasteryDefinitionPayload {
  return {
    key: draft.key.trim(),
    name: draft.name.trim(),
    category: draft.category.trim(),
    maxLevel: Number(draft.maxLevel),
    baseXpPerLevel: Number(draft.baseXpPerLevel),
    xpCurveExponent: Number(draft.xpCurveExponent),
    enabled: draft.enabled,
    effects: {},
  };
}
