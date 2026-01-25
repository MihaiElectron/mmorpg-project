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
  constructor(scene, x, y, texture = "player_idle_32px") {
    super(scene, x, y, texture);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.speed = 100;
    this.direction = "down";

    // -----------------------------
    // GATHERING (états + UI)
    // -----------------------------
    this.isGathering = false;
    this.gatherBar = null;
    this.gatherBarFill = null;

    this.scene = scene;
    this.socket = scene.socket;

    this.setupPhysics();
    this.registerSocketEvents();
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
   * SOCKET EVENTS (gathering)
   * -------------------------------------------------------
   */
  registerSocketEvents() {
    if (!this.socket) return;

    this.socket.on("start_gathering_result", (data) => {
      if (!data.success) {
        this.stopGathering();
        return;
      }
      this.startGatheringProgress(data.duration);
    });

    this.socket.on("gathering_complete", () => {
      this.stopGathering();
    });

    this.socket.on("stop_gathering_result", () => {
      this.stopGathering();
    });
  }

  /**
   * -------------------------------------------------------
   * DEMANDE DE GATHERING AU SERVEUR
   * -------------------------------------------------------
   */
  requestGather(targetId, targetType) {
    if (this.isGathering) return;

    this.socket.emit("start_gathering", {
      targetId,
      targetType,
    });
  }

  /**
   * -------------------------------------------------------
   * LANCEMENT DU GATHERING (progression)
   * -------------------------------------------------------
   */
  startGatheringProgress(duration) {
    this.isGathering = true;
    this.setVelocity(0);

    this.createGatherBar();

    this.scene.tweens.add({
      targets: this.gatherBarFill,
      scaleX: 1,
      duration,
    });
  }

  /**
   * -------------------------------------------------------
   * ARRÊT DU GATHERING
   * -------------------------------------------------------
   */
  stopGathering() {
    this.isGathering = false;

    if (this.gatherBar) this.gatherBar.destroy();
    if (this.gatherBarFill) this.gatherBarFill.destroy();

    this.gatherBar = null;
    this.gatherBarFill = null;
  }

  /**
   * -------------------------------------------------------
   * UI : BARRE DE GATHERING
   * -------------------------------------------------------
   */
  createGatherBar() {
    const width = 60;
    const height = 8;

    this.gatherBar = this.scene.add.rectangle(
      this.x,
      this.y - 32,
      width,
      height,
      0x000000,
      0.6,
    );

    this.gatherBarFill = this.scene.add.rectangle(
      this.x - width / 2,
      this.y - 32,
      width,
      height,
      0x00ff00,
      0.8,
    );

    this.gatherBarFill.setOrigin(0, 0.5);
    this.gatherBarFill.scaleX = 0;
  }

  /**
   * -------------------------------------------------------
   * MOUVEMENTS
   * -------------------------------------------------------
   */
  move(direction) {
    if (this.isGathering) return;

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
    if (this.isGathering) return;
    this.setVelocity(0);
  }

  /**
   * -------------------------------------------------------
   * UPDATE
   * -------------------------------------------------------
   */
  update() {
    if (this.isGathering) {
      this.setVelocity(0);
      return;
    }

    // Animations plus tard
  }
}
