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
 * instantanée : toute fabrication passe par un CraftJob (FABRIQUER → launch →
 * scheduler → claim), l'output n'étant matérialisé qu'au claim.
 */
export const MIN_CRAFT_TIME_MS = 3000;

/** Même valeur exprimée en secondes (affichage/édition DevTools). */
export const MIN_CRAFT_TIME_SECONDS = MIN_CRAFT_TIME_MS / 1000;

/** Message unique d'erreur de durée (réutilisé serveur + DevTools). */
export const MIN_CRAFT_TIME_MESSAGE =
  "La durée minimale d'une recette est de 3 secondes.";

/**
 * Règle XP d'échec V1 (source unique Runtime ⇄ DevTools ⇄ docs). Une tentative
 * de craft ratée n'accorde AUCUNE XP personnage mais une XP compétence partielle
 * égale à ce multiplicateur × l'XP compétence d'un succès (arrondi à l'entier
 * inférieur, par tentative). L'XP est accordée à la complétion du CraftJob, pas
 * au claim. Non configurable en DB — constante métier documentée.
 */
export const FAILURE_SKILL_XP_MULTIPLIER = 0.25;
