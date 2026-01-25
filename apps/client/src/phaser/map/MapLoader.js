/**
 * MapLoader (MMORPG)
 * -------------------------------------------------------
 * Rôle :
 * - Charger une map Tiled (.json)
 * - Charger un ou plusieurs tilesets
 * - Créer les layers dans le bon ordre
 * - Configurer les collisions (via collisions.json)
 * - Préparer les layers pour le depth sorting
 *
 * NOTE :
 * - collisions.json contient la liste des tileIndex bloquants.
 * - Le MapLoader ne gère PAS le joueur → WorldScene s’en charge.
 */

import Phaser from "phaser";
import collisions from "./collisions.json";

export default class MapLoader {
  constructor(scene) {
    this.scene = scene;

    // Taille des tiles (Tiled → 32x32 par défaut)
    this.tileSize = 32;
  }

  /**
   * -------------------------------------------------------
   * CHARGEMENT DE LA MAP
   * -------------------------------------------------------
   * key = nom de la map (déclarée dans PreloadScene)
   * tilemapPath = chemin vers le JSON (déjà préloadé)
   */
  loadMap(key) {
    // Création du tilemap depuis le cache
    const map = this.scene.make.tilemap({ key });

    /**
     * -------------------------------------------------------
     * CHARGEMENT DU TILESET
     * -------------------------------------------------------
     * IMPORTANT :
     * - Le nom "tiles" doit correspondre EXACTEMENT
     *   au nom du tileset dans Tiled.
     */
    const tileset = map.addTilesetImage(
      "tiles", // nom dans Tiled
      "tiles", // clé préloadée dans PreloadScene
      this.tileSize,
      this.tileSize,
    );

    // Configuration des collisions
    this.setupCollisions(map);

    return { map, tileset };
  }

  /**
   * -------------------------------------------------------
   * CONFIGURATION DES COLLISIONS
   * -------------------------------------------------------
   * collisions.json = [1, 2, 3, 45, 78, ...]
   * Chaque index correspond à un tile bloquant.
   */
  setupCollisions(map) {
    collisions.forEach((tileIndex) => {
      map.setCollision(tileIndex);
    });
  }

  /**
   * -------------------------------------------------------
   * CREATION D’UN LAYER
   * -------------------------------------------------------
   * layerName = nom du layer dans Tiled
   * tileset = tileset chargé plus haut
   */
  createLayer(map, layerName, tileset) {
    const layer = map.createLayer(layerName, tileset);

    // Optionnel : profondeur automatique
    layer.setDepth(0);

    return layer;
  }

  /**
   * -------------------------------------------------------
   * CREATION D’UNE MAP COMPLETE (layers + collisions)
   * -------------------------------------------------------
   * Méthode pratique pour charger une map complète d’un coup.
   */
  createFullMap(key, layerNames = []) {
    const { map, tileset } = this.loadMap(key);

    const layers = {};

    layerNames.forEach((name) => {
      layers[name] = this.createLayer(map, name, tileset);
    });

    return { map, tileset, layers };
  }
}
