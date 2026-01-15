/**
 * PlayerController (MMORPG)
 * -------------------------------------------------------
 * Rôle :
 * - Gérer les inputs du joueur
 * - Appeler les méthodes du Player (move, stop)
 * - Préparer les animations (plus tard)
 * - Préparer les inputs avancés (dash, skills, inventaire)
 *
 * NOTE :
 * - Le PlayerController ne déplace PAS directement le sprite.
 * - Il délègue au Player (Player.move / Player.stop).
 */

import Player from "./Player.js";

export default class PlayerController {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;

    // Vitesse configurable (peut être modifiée par équipements, buffs…)
    this.speed = player.speed || 200;

    // Inputs clavier
    this.cursors = this.scene.input.keyboard.createCursorKeys();

    // Touches supplémentaires (ZQSD, espace, shift…)
    this.extraKeys = this.scene.input.keyboard.addKeys({
      upZ: Phaser.Input.Keyboard.KeyCodes.Z,
      leftQ: Phaser.Input.Keyboard.KeyCodes.Q,
      downS: Phaser.Input.Keyboard.KeyCodes.S,
      rightD: Phaser.Input.Keyboard.KeyCodes.D,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      shift: Phaser.Input.Keyboard.KeyCodes.SHIFT
    });

    this.setupInput();
  }

  /**
   * -------------------------------------------------------
   * SETUP INPUTS
   * -------------------------------------------------------
   * Ici tu pourras ajouter :
   * - raccourcis inventaire
   * - raccourcis compétences
   * - dash (shift)
   * - interaction (E)
   */
  setupInput() {
    // Exemple futur :
    // this.extraKeys.space.on("down", () => this.player.jump());
  }

  /**
   * -------------------------------------------------------
   * UPDATE (boucle principale)
   * -------------------------------------------------------
   * Gère :
   * - déplacements
   * - diagonales
   * - orientation
   * - animations (plus tard)
   */
  update() {
    const { left, right, up, down } = this.cursors;
    const { upZ, leftQ, downS, rightD } = this.extraKeys;

    let moving = false;

    // Déplacements horizontaux
    if (left.isDown || leftQ.isDown) {
      this.player.move("left");
      moving = true;
    } else if (right.isDown || rightD.isDown) {
      this.player.move("right");
      moving = true;
    }

    // Déplacements verticaux
    if (up.isDown || upZ.isDown) {
      this.player.move("up");
      moving = true;
    } else if (down.isDown || downS.isDown) {
      this.player.move("down");
      moving = true;
    }

    // Aucun input → stop
    if (!moving) {
      this.player.stop();
    }
  }
}
