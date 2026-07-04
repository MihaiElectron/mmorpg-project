/**
 * Constantes métier partagées du domaine Craft.
 *
 * Cohérence obligatoire (Runtime ⇄ DevTools ⇄ ADR-0009) : toute règle exprimée
 * ici doit être appliquée par le Runtime (validation serveur), reflétée dans le
 * DevTools (Recipe Editor) et documentée dans l'ADR. Aucune règle ne vit dans
 * un seul de ces trois endroits.
 */

/**
 * Durée minimale d'une recette joueur (ms). Aucune recette joueur ne peut être
 * instantanée : toute fabrication passe par un CraftJob. Le craft instantané
 * (`CraftingService.craft`) reste réservé au legacy/interne/admin/tests.
 */
export const MIN_CRAFT_TIME_MS = 3000;

/** Même valeur exprimée en secondes (affichage/édition DevTools). */
export const MIN_CRAFT_TIME_SECONDS = MIN_CRAFT_TIME_MS / 1000;

/** Message unique d'erreur de durée (réutilisé serveur + DevTools). */
export const MIN_CRAFT_TIME_MESSAGE =
  "La durée minimale d'une recette est de 3 secondes.";
