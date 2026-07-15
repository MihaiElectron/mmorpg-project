import {
  CREATURE_COEFFICIENT_KEYS,
  CoefficientDraft,
  CreatureCoefficientKey,
  CreatureSecondaryCoefficients,
} from "./creatureCoefficients.types";

/** Config effective serveur → brouillon éditable (valeurs en chaîne). */
export function toDraft(config: CreatureSecondaryCoefficients): CoefficientDraft {
  const draft = {} as CoefficientDraft;
  for (const key of CREATURE_COEFFICIENT_KEYS) draft[key] = String(config[key]);
  return draft;
}

/** Un champ est invalide s'il est vide ou non numérique fini (NaN/Infinity). */
export function isFieldInvalid(raw: string): boolean {
  if (raw.trim() === "") return true;
  const n = Number(raw);
  return !Number.isFinite(n);
}

/** Liste des clés dont la valeur brouillon est invalide. */
export function invalidKeys(draft: CoefficientDraft): CreatureCoefficientKey[] {
  return CREATURE_COEFFICIENT_KEYS.filter((key) => isFieldInvalid(draft[key]));
}

/** Un champ est "modifié" s'il est valide et diffère de la config courante. */
export function isFieldModified(
  raw: string,
  current: number,
): boolean {
  return !isFieldInvalid(raw) && Number(raw) !== current;
}

/** true si au moins un champ valide diffère de la config courante. */
export function isDirty(draft: CoefficientDraft, current: CreatureSecondaryCoefficients): boolean {
  return CREATURE_COEFFICIENT_KEYS.some((key) => isFieldModified(draft[key], current[key]));
}

/**
 * Construit le patch PARTIEL à envoyer : uniquement les champs modifiés ET
 * valides (jamais NaN, jamais chaîne vide). Les champs inchangés ou invalides
 * sont omis. Le serveur applique les bornes finales.
 */
export function buildPatch(
  draft: CoefficientDraft,
  current: CreatureSecondaryCoefficients,
): Partial<CreatureSecondaryCoefficients> {
  const patch: Partial<CreatureSecondaryCoefficients> = {};
  for (const key of CREATURE_COEFFICIENT_KEYS) {
    const raw = draft[key];
    if (isFieldInvalid(raw)) continue;
    const n = Number(raw);
    if (n !== current[key]) patch[key] = n;
  }
  return patch;
}
