/**
 * PreloadScene (MMORPG)
 */

import Phaser from "phaser";

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload() {
    console.log("PreloadScene: preload()");

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBg = this.add.rectangle(width / 2, height / 2, 300, 30, 0x222222).setOrigin(0.5);
    const progressBar = this.add.rectangle(width / 2 - 150, height / 2, 0, 30, 0xffffff).setOrigin(0, 0.5);

    this.load.on("progress", (value) => {
      progressBar.width = 300 * value;
    });

    this.add.text(width / 2, height / 2 - 40, "Chargement du monde...", {
      fontSize: "20px",
      color: "#ffffff",
    }).setOrigin(0.5);

    /**
     * SPRITE DU JOUEUR
     * La key DOIT être "player_idle_32"
     */
    this.load.image("player_idle_32", "assets/player/player_idle_32px.png");

    /**
     * SPRITE FIRE CAMP
     */
    this.load.image("fire_camp", "assets/sprites/fire_camp.png");

    this.load.on("complete", () => {
      console.log("PreloadScene: complete → start WorldScene");
      this.time.delayedCall(200, () => {
        this.scene.start("WorldScene");
      });
    });
  }

  create() {}
}
