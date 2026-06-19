/**
 * PreloadScene (MMORPG)
 */

import Phaser from "phaser";

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add
      .rectangle(width / 2 - 150, height / 2, 0, 30, 0xffffff)
      .setOrigin(0, 0.5);

    this.load.on("progress", (value) => {
      progressBar.width = 300 * value;
    });

    this.load.on("loaderror", (file) => {
      console.warn("[PreloadScene] asset failed to load:", file.key, file.url);
    });

    this.add
      .text(width / 2, height / 2 - 40, "Chargement du monde...", {
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // Terrain pipeline test — requires terrain_pipeline_test.tmj exported from Tiled
    this.load.tilemapTiledJSON("terrain_pipeline_test", "/assets/maps/terrain_pipeline_test.tmj");
    this.load.image("tileset_grass", "/assets/maps/tilesets/grass_01.png");

    this.load.image("player_male_32x64", "/assets/player/player_male_32x64.png");
    this.load.image(
      "player_female_32x64",
      "/assets/player/player_female_32x64.png",
    );
    this.load.image("fire_camp", "/assets/sprites/fire_camp.png");
    this.load.image("dead_tree", "/assets/sprites/dead_tree.png");
    this.load.image("turkey", "/assets/bestiary/turkey_32.png");
    this.load.image("wooden_stick", "/assets/images/items/wooden_stick.png");
  }

  create() {
    this.scene.start("WorldScene");
  }
}
