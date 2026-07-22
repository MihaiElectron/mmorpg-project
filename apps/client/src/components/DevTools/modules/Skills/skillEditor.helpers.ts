// Helpers PURS de l'éditeur de skills (Lot A — écoles magiques). Aucune logique
// métier : uniquement la normalisation/validation de `magicSchool` en fonction de
// `damageType`, testables sans rendu React. La validation serveur reste l'autorité.

import {
  SKILL_MAGIC_SCHOOLS,
  type SkillDamageType,
  type SkillMagicSchool,
} from "./skills.types";

/** Valeur brute du select école dans l'état local : école canonique ou "" (non choisie). */
export type MagicSchoolDraftValue = "" | SkillMagicSchool;

/** true si l'école doit être renseignée/affichée (skill à dégâts magiques). */
export function requiresMagicSchool(damageType: SkillDamageType): boolean {
  return damageType === "magic";
}

/**
 * École à envoyer dans le payload : l'école choisie UNIQUEMENT si `magic`,
 * sinon `null`. Garantit qu'un skill devenu physical/raw ne conserve jamais une
 * ancienne école (jamais de résidu silencieux). `""` (non choisie) → `null`.
 */
export function normalizeMagicSchoolForPayload(
  damageType: SkillDamageType,
  rawSchool: MagicSchoolDraftValue,
): SkillMagicSchool | null {
  if (damageType !== "magic") return null;
  return rawSchool === "" ? null : rawSchool;
}

/**
 * Erreur de validation LOCALE (message) ou `null`. Un skill à dégâts `magic` doit
 * avoir une école ; physical/raw n'en ont jamais. Le serveur reste l'autorité.
 */
export function magicSchoolValidationError(
  damageType: SkillDamageType,
  rawSchool: MagicSchoolDraftValue,
): string | null {
  if (damageType === "magic" && rawSchool === "") {
    return "L'école magique est requise pour un skill à dégâts magiques.";
  }
  return null;
}

/** Valeur initiale du select école depuis la valeur serveur (null → ""). */
export function magicSchoolDraftFromSkill(
  magicSchool: SkillMagicSchool | null | undefined,
): MagicSchoolDraftValue {
  return magicSchool ?? "";
}

/** Garde de type : `value` est une école canonique. */
export function isMagicSchool(value: string): value is SkillMagicSchool {
  return (SKILL_MAGIC_SCHOOLS as readonly string[]).includes(value);
}
