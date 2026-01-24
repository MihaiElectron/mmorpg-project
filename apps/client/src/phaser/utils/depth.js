/**
 * Gestion des profondeurs (depth sorting) pour un jeu top‑down
 * ---------------------------------------------------------------------------
 * Ce module fournit des utilitaires pour gérer l'ordre d'affichage (depth)
 * des sprites dans un jeu 2D vu du dessus.
 *
 * Problème classique :
 * - Si on utilise sprite.y pour le depth, le haut du sprite peut passer
 *   derrière un objet alors que le bas devrait déterminer la profondeur.
 *
 * Solution :
 * - On calcule la profondeur à partir du "pied" du sprite :
 *     depth = sprite.y + sprite.height / 2
 *   Cela garantit un tri naturel : ce qui est plus bas à l'écran passe devant.
 * ---------------------------------------------------------------------------
 */

export const DEPTH_LAYERS = {
  GROUND: 0,     // Sol, décor plat
  OBJECTS: 10,   // Objets statiques (arbres, rochers…)
  PLAYERS: 20,   // Joueurs
  NPC: 30,       // PNJ
  UI: 100        // Interface
};

/**
 * Calcule la profondeur d'un sprite en fonction de sa position réelle au sol.
 * On utilise le bas du sprite (pied) pour un tri correct.
 *
 * @param {Phaser.GameObjects.Sprite} sprite - Le sprite dont on veut le depth
 * @returns {number} - La profondeur calculée
 */
export function calculateDepth(sprite) {
  // Le "pied" du sprite = y + moitié de la hauteur
  return Math.floor(sprite.y + sprite.height / 2);
}

/**
 * Trie une liste d'objets selon leur profondeur (bas du sprite).
 *
 * @param {Array} objects - Liste d'objets avec propriété y et height
 * @returns {Array} - Liste triée
 */
export function sortByDepth(objects) {
  return [...objects].sort(
    (a, b) => (a.y + a.height / 2) - (b.y + b.height / 2)
  );
}

/**
 * Applique automatiquement la profondeur correcte à un sprite.
 *
 * @param {Phaser.GameObjects.Sprite} sprite - Le sprite à mettre à jour
 */
export function setSpriteDepth(sprite) {
  sprite.setDepth(calculateDepth(sprite));
}

export default {
  DEPTH_LAYERS,
  calculateDepth,
  sortByDepth,
  setSpriteDepth
};
