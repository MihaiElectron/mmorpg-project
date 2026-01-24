/**
 * Phaser Configuration (MMORPG Architecture)
 * ------------------------------------------
 * Ce fichier centralise la configuration Phaser.
 * Il est volontairement minimal, mais déjà structuré pour un MMORPG :
 *
 * - Séparation des scènes (Boot → Preload → World)
 * - Arcade Physics activé (gravité désactivée pour un jeu 2D top‑down)
 * - parent: "game-container" → monté dans WorldPage.jsx
 *
 * NOTE :
 * - La gravité reste à 0 car un MMORPG top‑down n’en utilise pas.
 * - Si plus tard tu fais un mode plateforme, tu pourras l’activer ici.
 */

import Phaser from "phaser";
import BootScene from "../core/BootScene";
import PreloadScene from "../core/PreloadScene";
import WorldScene from "../core/WorldScene";

const phaserConfig = {
  type: Phaser.AUTO,

  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: "100%",
    height: "100%"
  },
  

  parent: "game-container",

  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0 }, // MMORPG top‑down → pas de gravité
      debug: false       // Passe à true pour visualiser les hitboxes
    }
  },

  /**
   * Scènes Phaser
   * -------------
   * L’ordre est CRUCIAL :
   * 1. BootScene     → initialise les plugins, settings
   * 2. PreloadScene  → charge les assets (sprites, maps, audio)
   * 3. WorldScene    → scène principale du monde
   */
  scene: [
    BootScene,
    PreloadScene,
    WorldScene
  ]
};

export default phaserConfig;
