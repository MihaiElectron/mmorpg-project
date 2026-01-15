/**
 * PreloadScene (MMORPG)
 * -------------------------------------------------------
 * Cette scène charge tous les assets nécessaires au monde :
 * - Map Tiled (.json)
 * - Tileset (.png)
 * - Sprites du joueur (plus tard)
 * - UI (plus tard)
 *
 * NOTE IMPORTANTE :
 * Les chemins doivent correspondre EXACTEMENT à ton arborescence.
 * Exemple :
 * src/assets/maps/world.json
 * src/assets/maps/tiles.png
 */

import Phaser from "phaser";

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload() {
    /**
     * -------------------------------------------------------
     * 1. BARRE DE CHARGEMENT
     * -------------------------------------------------------
     */
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
     * -------------------------------------------------------
     * 2. CHARGEMENT DES ASSETS TILED
     * -------------------------------------------------------
     * ⚠️ À ADAPTER selon ton arborescence réelle.
     *
     * Exemple recommandé :
     * src/assets/maps/world.json
     * src/assets/maps/tiles.png
     */

    // Map JSON
    this.load.tilemapTiledJSON("world", "assets/maps/world.json");

    // Tileset PNG
    this.load.image("tiles", "assets/maps/tiles.png");

    /**
     * -------------------------------------------------------
     * 3. SPRITES DU JOUEUR (placeholder)
     * -------------------------------------------------------
     * Tu ajouteras ton spritesheet ici plus tard.
     */
    // this.load.spritesheet("player", "assets/player/player.png", {
    //   frameWidth: 32,
    //   frameHeight: 32,
    // });

    /**
     * -------------------------------------------------------
     * 4. FIN DU PRELOAD
     * -------------------------------------------------------
     */
    this.load.on("complete", () => {
      this.time.delayedCall(200, () => {
        this.scene.start("WorldScene");
      });
    });
  }

  create() {
    // Rien ici : tout se passe dans preload()
  }
}
