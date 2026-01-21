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
    this.equipment = {}; // Stockage local de l'équipement
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

    // On réduit la hitbox (exemple : 40x20)
    this.fireCamp.body.setSize(40, 20);
    
    // On repositionne la hitbox si nécessaire (exemple : centrée)
    this.fireCamp.body.setOffset(
        (this.fireCamp.width - 40) / 2,
        (this.fireCamp.height - 20) / 2
    );
    
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

    /**
     * -------------------------------------------------------
     * 6. ÉQUIPEMENT INITIAL
     * -------------------------------------------------------
     */
    // Écouter les événements d'équipement depuis React
    this.game.events.on('equipment-changed', this.updateEquipment, this);
  }

  update() {
    if (this.controller) {
      this.controller.update();
    }
  }

  /**
   * -------------------------------------------------------
   * MISE À JOUR ÉQUIPEMENT
   * -------------------------------------------------------
   * Appelé depuis React quand l'équipement change
   */
  updateEquipment(equipment) {
    console.log('WorldScene: updateEquipment called with equipment:', equipment);
    this.equipment = equipment;

    if (!this.player) {
      console.warn('WorldScene: player not ready yet');
      return;
    }

    // Pour l'instant : juste un log pour montrer que ça marche
    // Plus tard : changer la texture ou ajouter des sprites overlays

    const equippedItems = Object.values(equipment).filter(item => item !== null);
    console.log(`WorldScene: Player has ${equippedItems.length} equipped items`);

    // Exemple : afficher un message temporaire pour tester
    if (equippedItems.length > 0) {
      console.log('WorldScene: Player is equipped! Items:', equippedItems.map(item => item.name));
    } else {
      console.log('WorldScene: Player has no equipment');
    }

    // TODO: Ici on pourra changer la texture ou ajouter des sprites overlays
    // Pour l'instant, la texture reste la même
  }

  /**
   * -------------------------------------------------------
   * NETTOYAGE
   * -------------------------------------------------------
   */
  destroy() {
    // Nettoyer les événements
    if (this.game && this.game.events) {
      this.game.events.off('equipment-changed', this.updateEquipment, this);
    }
    super.destroy();
  }
}
