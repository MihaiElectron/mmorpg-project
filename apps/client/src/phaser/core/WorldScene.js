/**
 * WorldScene (MMORPG)
 */

import Phaser from "phaser";
import Player from "../player/Player";
import PlayerController from "../player/PlayerController";

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: "WorldScene" });

    this.player = null;
    this.controller = null;
    this.fireCamp = null;
  }

  create() {
    console.log("WorldScene: create()");

    // Fond vert
    this.cameras.main.setBackgroundColor(0x2ecc71);

    // Fix du viewport
    this.cameras.main.setViewport(
      0,
      0,
      this.scale.width,
      this.scale.height
    );

    /**
     * -------------------------------------------------------
     * 1. JOUEUR
     * -------------------------------------------------------
     */
    this.player = new Player(this, 400, 300, "player_idle_32");

    /**
     * -------------------------------------------------------
     * 2. FIRE CAMP
     * -------------------------------------------------------
     */
    this.fireCamp = this.physics.add.staticImage(600, 300, "fire_camp");
    this.fireCamp.refreshBody();

    this.physics.add.collider(this.player, this.fireCamp);

    /**
     * -------------------------------------------------------
     * 3. CONTROLLER
     * -------------------------------------------------------
     */
    this.controller = new PlayerController(this, this.player);

    /**
     * -------------------------------------------------------
     * 4. INPUT SOURIS
     * -------------------------------------------------------
     * - pointerdown : début du déplacement
     * - pointermove : mise à jour tant que clic maintenu
     * - pointerup   : arrêt
     */
    this.input.on("pointerdown", (pointer) => {
      this.controller.startMouseMove(pointer.worldX, pointer.worldY);
    });

    this.input.on("pointermove", (pointer) => {
      if (pointer.isDown) {
        this.controller.updateMouseTarget(pointer.worldX, pointer.worldY);
      }
    });

    this.input.on("pointerup", () => {
      this.controller.stopMouseMove();
    });

    /**
     * -------------------------------------------------------
     * 5. CAMERA
     * -------------------------------------------------------
     */
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.5);
  }

  update() {
    if (this.controller) {
      this.controller.update();
    }
  }
}
