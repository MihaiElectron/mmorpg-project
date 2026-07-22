// Helpers PURS de l'éditeur de skills (Lot A — écoles magiques). Aucune logique
// métier : uniquement la normalisation/validation de `magicSchool` en fonction de
// `damageType`, testables sans rendu React. La validation serveur reste l'autorité.

import {
  SKILL_MAGIC_SCHOOLS,
  type SkillAttackDefenseKind,
  type SkillDamageType,
  type SkillEffectType,
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

// ── Règle canonique du critique + normalisation des flags combat (miroir serveur) ──

/** true si les dégâts sont physiques (seul cas où « Critiquable » est pertinent). */
export function isPhysicalDamage(
  effectType: SkillEffectType,
  damageType: SkillDamageType,
): boolean {
  return effectType === "damage" && damageType === "physical";
}

/** true si les dégâts sont magiques (défenses magiques verrouillées). */
export function isMagicDamage(
  effectType: SkillEffectType,
  damageType: SkillDamageType,
): boolean {
  return effectType === "damage" && damageType === "magic";
}

/** Valeur `canCrit` à envoyer : conservée seulement pour des dégâts physiques. */
export function normalizeCanCritForPayload(
  effectType: SkillEffectType,
  damageType: SkillDamageType,
  canCrit: boolean,
): boolean {
  return isPhysicalDamage(effectType, damageType) ? canCrit === true : false;
}

/** Flags combat normalisés côté client (miroir du serveur `normalizeSkillCombatFlags`). */
export interface NormalizedCombatFlagsDraft {
  attackDefenseKind: SkillAttackDefenseKind;
  canBeBlocked: boolean;
  canBeParried: boolean;
  canCrit: boolean;
}

/**
 * Normalise les flags combat pour un draft (jamais de résidu incohérent) :
 *  - dégâts `magic` ⇒ `attackDefenseKind = magic`, non blocable, non parable,
 *    `canCrit` false (esquive laissée telle quelle) ;
 *  - hors dégâts physiques ⇒ `canCrit` false.
 * Le serveur reste l'autorité ; ceci évite tout envoi incohérent.
 */
export function normalizeCombatFlagsForPayload(input: {
  effectType: SkillEffectType;
  damageType: SkillDamageType;
  attackDefenseKind: SkillAttackDefenseKind;
  canBeBlocked: boolean;
  canBeParried: boolean;
  canCrit: boolean;
}): NormalizedCombatFlagsDraft {
  const magic = isMagicDamage(input.effectType, input.damageType);
  return {
    attackDefenseKind: magic ? "magic" : input.attackDefenseKind,
    canBeBlocked: magic ? false : input.canBeBlocked,
    canBeParried: magic ? false : input.canBeParried,
    canCrit: normalizeCanCritForPayload(input.effectType, input.damageType, input.canCrit),
  };
}
