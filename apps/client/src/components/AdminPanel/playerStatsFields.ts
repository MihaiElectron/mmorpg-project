import type { FieldDef } from "./adminPanel.shared";

/**
 * Champs stats joueur du DevTools Character Editor (Progression V1).
 *
 * Trois groupes ÉDITABLES (progression, stats principales, combat brut/debug)
 * partagent le même draft `useDraft`. Les stats DÉRIVÉES sont lecture seule :
 * elles ne figurent JAMAIS dans un FieldDef éditable ni dans le payload
 * `admin:update_character` — elles sont calculées serveur (`stats.derived`).
 */

// A. Progression ────────────────────────────────────────────────────────────
export const PLAYER_PROGRESSION_FIELDS: FieldDef[] = [
  { key: "level", label: "Niveau", min: 1 },
  { key: "experience", label: "XP", min: 0 },
  { key: "unspentStatPoints", label: "Points dispo", min: 0 },
];

// B. Stats principales ───────────────────────────────────────────────────────
export const PLAYER_PRIMARY_STAT_FIELDS: FieldDef[] = [
  { key: "baseStrength", label: "Force", min: 0 },
  { key: "baseVitality", label: "Vitalité", min: 0 },
  { key: "baseEndurance", label: "Endurance", min: 0 },
  { key: "baseAgility", label: "Agilité", min: 0 },
  { key: "baseDexterity", label: "Dextérité", min: 0 },
  { key: "baseIntelligence", label: "Intelligence", min: 0 },
  { key: "baseWisdom", label: "Sagesse", min: 0 },
  { key: "baseCritical", label: "Critique", min: 0 },
];

// C. Combat brut / debug (valeurs brutes, distinctes des dérivées) ────────────
export const PLAYER_COMBAT_FIELDS: FieldDef[] = [
  { key: "health", label: "PV (brut)", min: 0 },
  { key: "maxHealth", label: "PV max (brut)", min: 1 },
  { key: "attack", label: "Attaque (brut)", min: 0 },
  { key: "defense", label: "Défense (brut)", min: 0 },
];

/** Tous les champs éditables — passés à un seul `useDraft`. */
export const PLAYER_EDITABLE_FIELDS: FieldDef[] = [
  ...PLAYER_PROGRESSION_FIELDS,
  ...PLAYER_PRIMARY_STAT_FIELDS,
  ...PLAYER_COMBAT_FIELDS,
];

/** Stats dérivées — LECTURE SEULE, lues depuis `player.stats.derived`. */
export type DerivedRow = { key: string; label: string; suffix?: string };

export const PLAYER_DERIVED_ROWS: DerivedRow[] = [
  { key: "maxHealth", label: "PV max (dérivé)" },
  { key: "physicalAttack", label: "Attaque physique (dérivée)" },
  { key: "defense", label: "Défense (dérivée)" },
  { key: "criticalChance", label: "Chance critique", suffix: "%" },
  { key: "criticalDamage", label: "Dégâts critiques", suffix: "%" },
  { key: "dodgeChance", label: "Esquive", suffix: "%" },
  { key: "accuracy", label: "Précision" },
  { key: "initiative", label: "Initiative" },
];

/** Formatage lecture seule d'une valeur dérivée (arrondi + suffixe). */
export function formatDerived(value: number | undefined, suffix?: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${suffix ?? ""}`;
}
