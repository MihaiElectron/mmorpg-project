/**
 * WorldScene (MMORPG)
 * -------------------------------------------------------
 * Scène principale du monde.
 *
 * Intègre :
 * - MapLoader (chargement Tiled + collisions)
 * - Player (entité physique)
 * - PlayerController (inputs + mouvements)
 * - Caméra dynamique
 *
 * NOTE :
 * - La map doit être préloadée dans PreloadScene :
 *   this.load.tilemapTiledJSON("world", "assets/maps/world.json");
 *   this.load.image("tiles", "assets/maps/tiles.png");
 */

import Phaser from "phaser";
import MapLoader from "../map/MapLoader";
import Player from "../player/Player";
import PlayerController from "../player/PlayerController";

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: "WorldScene" });

    this.mapLoader = null;
    this.map = null;
    this.layers = {};
    this.player = null;
    this.controller = null;
  }

  create() {
    /**
     * -------------------------------------------------------
     * 1. CHARGEMENT DE LA MAP (Tiled)
     * -------------------------------------------------------
     */
    this.mapLoader = new MapLoader(this);

    // Charge la map + tileset + layers
    const { map, layers } = this.mapLoader.createFullMap("world", [
      "Ground",
      "Decor",
      "Collisions"
    ]);

    this.map = map;
    this.layers = layers;

    // Active les collisions sur le layer "Collisions"
    if (layers.Collisions) {
      layers.Collisions.setCollisionByProperty({ collides: true });
    }

    /**
     * -------------------------------------------------------
     * 2. CREATION DU JOUEUR
     * -------------------------------------------------------
     * Pour l’instant : un rectangle vert (placeholder)
     * Plus tard : spritesheet animé
     */
    this.player = new Player(this, 400, 300, null);

    // Collision joueur ↔ map
    if (layers.Collisions) {
      this.physics.add.collider(this.player, layers.Collisions);
    }

    /**
     * -------------------------------------------------------
     * 3. CONTROLLER DU JOUEUR
     * -------------------------------------------------------
     */
    this.controller = new PlayerController(this, this.player);

    /**
     * -------------------------------------------------------
     * 4. CAMERA
     * -------------------------------------------------------
     */
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.5);

    /**
     * -------------------------------------------------------
     * 5. DEPTH SORTING (ordre d’affichage)
     * -------------------------------------------------------
     * Ground → derrière tout
     * Player → au milieu
     * Decor → devant le joueur
     */
    if (layers.Ground) layers.Ground.setDepth(0);
    if (layers.Decor) layers.Decor.setDepth(2);
    this.player.setDepth(1);
  }

  update() {
    if (this.controller) {
      this.controller.update();
    }
  }
}
