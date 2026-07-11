// Suggestions de weaponType partagées entre les modules DevTools (Skills,
// MasteryEffects — et à terme Items). Saisie/valeur libre acceptée côté
// serveur (format [a-z0-9_] validé par les DTOs) : ce catalogue n'est PAS une
// enum stricte, seulement les valeurs connues du contenu actuel.
export const WEAPON_TYPE_SUGGESTIONS = [
  "two_handed_sword",
  "two_handed_axe",
  "bow",
  "crossbow",
] as const;

export type WeaponTypeSuggestion = (typeof WEAPON_TYPE_SUGGESTIONS)[number];

/** true si `value` fait partie des suggestions connues. */
export function isKnownWeaponType(value: string): boolean {
  return (WEAPON_TYPE_SUGGESTIONS as readonly string[]).includes(value);
}
