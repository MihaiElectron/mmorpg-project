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
  constructor(scene, x, y, texture) {
    super(scene, x, y, texture, 0);

    // Ajout du sprite dans la scène + activation physique
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Paramètres du joueur
    this.speed = 200; // Valeur par défaut (modifiable)
    this.direction = "down"; // Orientation initiale

    this.setupPhysics();
  }

  /**
   * -------------------------------------------------------
   * CONFIGURATION PHYSIQUE
   * -------------------------------------------------------
   * - collisions avec les bords du monde
   * - hitbox ajustable (plus tard)
   */
  setupPhysics() {
    this.setCollideWorldBounds(true);

    // Exemple pour ajuster la hitbox (désactivé pour l’instant)
    // this.setSize(16, 24);
    // this.setOffset(8, 8);
  }

  /**
   * -------------------------------------------------------
   * MOUVEMENTS
   * -------------------------------------------------------
   * Le PlayerController appellera move() ou stop().
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
   * UPDATE (optionnel)
   * -------------------------------------------------------
   * Si tu veux gérer des animations ici plus tard :
   * - idle
   * - walk
   * - run
   */
  update() {
    // Exemple futur :
    // if (this.body.velocity.x !== 0 || this.body.velocity.y !== 0) {
    //   this.play("player-walk-" + this.direction, true);
    // } else {
    //   this.play("player-idle-" + this.direction, true);
    // }
  }
}
