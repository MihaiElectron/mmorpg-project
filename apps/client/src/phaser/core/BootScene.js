/**
 * BootScene (MMORPG)
 * ------------------------------------------
 * Cette scène est la toute première à être lancée.
 * Son rôle :
 * - Initialiser les paramètres globaux du jeu
 * - Charger les plugins essentiels (si besoin)
 * - Préparer le passage vers PreloadScene
 *
 * NOTE :
 * - On ne charge PAS d'assets ici (sauf logos ultra-légers)
 * - On garde cette scène minimaliste pour un boot rapide
 */

import Phaser from "phaser";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    /**
     * Ici tu peux charger un logo ou un loader minimal.
     * Exemple :
     * this.load.image("logo", "assets/ui/logo.png");
     *
     * Pour l’instant on laisse vide → boot ultra rapide.
     */
  }

  create() {
    /**
     * Paramètres globaux du jeu
     * Ici tu peux définir :
     * - limites du monde
     * - paramètres de scaling
     * - configuration du pixelArt
     * - activation de plugins
     */

    // Exemple : activer le pixelArt (utile pour style rétro)
    this.game.config.pixelArt = true;

    // Exemple : désactiver lissage (sprites pixel perfect)
    this.game.renderer.antialias = false;

    /**
     * Transition immédiate vers PreloadScene
     * PreloadScene va charger :
     * - spritesheets
     * - tilesets
     * - maps Tiled
     * - audio
     * - animations
     */
    this.scene.start("PreloadScene");
  }
}
