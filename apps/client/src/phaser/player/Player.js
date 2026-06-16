/**
 * Player (MMORPG)
 * -------------------------------------------------------
 * Classe représentant le joueur dans le monde.
 *
 * Rôle :
 * - Étendre Phaser.Physics.Arcade.Sprite
 * - Gérer les collisions
 * - Gérer les déplacements
 * - Préparer les animations (plus tard)
 * - Préparer la synchronisation réseau (plus tard)
 *
 * NOTE :
 * - Le PlayerController gérera la logique de mouvement.
 * - Cette classe reste volontairement simple.
 */

import Phaser from "phaser";

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, texture = "player_male_32x64") {
    super(scene, x, y, texture);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.speed = 100;
    this.direction = "down";

    this.scene = scene;
    this.socket = scene.socket;

    this.setupPhysics();
  }

  /**
   * -------------------------------------------------------
   * CONFIGURATION PHYSIQUE
   * -------------------------------------------------------
   */
  setupPhysics() {
    this.setCollideWorldBounds(true);

    const hitboxWidth = 20;
    const hitboxHeight = 16;

    this.body.setSize(hitboxWidth, hitboxHeight);
    this.body.setOffset(
      (this.width - hitboxWidth) / 2,
      this.height - hitboxHeight,
    );
  }

  /**
   * -------------------------------------------------------
   * MOUVEMENTS
   * -------------------------------------------------------
   */
  move(direction) {
    this.direction = direction;
    this.setVelocity(0);

    switch (direction) {
      case "up":
        this.setVelocityY(-this.speed);
        break;
      case "down":
        this.setVelocityY(this.speed);
        break;
      case "left":
        this.setVelocityX(-this.speed);
        break;
      case "right":
        this.setVelocityX(this.speed);
        break;
    }
  }

  stop() {
    this.setVelocity(0);
  }

  /**
   * -------------------------------------------------------
   * UPDATE
   * -------------------------------------------------------
   */
  update() {
    // Animations plus tard
  }
}
