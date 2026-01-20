// Depth sorting utilities for game objects

export const DEPTH_LAYERS = {
  GROUND: 0,
  OBJECTS: 10,
  PLAYERS: 20,
  NPC: 30,
  UI: 100
};

/**
 * Calculate depth based on Y position for side-scrolling/top-down games
 * @param {number} y - The Y position of the object
 * @returns {number} - The calculated depth
 */
export function calculateDepth(y) {
  return Math.floor(y);
}

/**
 * Sort game objects by their Y position for proper depth rendering
 * @param {Array} objects - Array of game objects with y property
 * @returns {Array} - Sorted array
 */
export function sortByDepth(objects) {
  return [...objects].sort((a, b) => a.y - b.y);
}

/**
 * Set depth for a sprite based on its position
 * @param {Phaser.GameObjects.Sprite} sprite - The sprite to set depth for
 */
export function setSpriteDepth(sprite) {
  sprite.setDepth(calculateDepth(sprite.y));
}

export default {
  DEPTH_LAYERS,
  calculateDepth,
  sortByDepth,
  setSpriteDepth
};
