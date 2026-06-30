/**
 * textureLoader.js
 *
 * Helper générique de chargement dynamique de textures Phaser.
 *
 * Convention AssetPath :
 *   - Si key commence par "/assets/", c'est un chemin public Vite.
 *     La key EST l'URL de chargement. Elle sert aussi de clé Phaser.
 *   - Sinon, c'est une textureKey legacy supposée déjà chargée par PreloadScene.
 *
 * Usage :
 *   loadTextureIfMissing(scene, "/assets/bestiary/turkey_32.png", {
 *     fallbackKey: "dead_tree",
 *     onReady: (resolvedKey) => scene.add.image(x, y, resolvedKey),
 *   });
 */

/**
 * @param {Phaser.Scene} scene
 * @param {string|null} key - AssetPath ou textureKey Phaser
 * @param {{ fallbackKey?: string, onReady?: (key: string) => void }} [opts]
 */
export function loadTextureIfMissing(scene, key, opts = {}) {
  const { fallbackKey = null, onReady = null } = opts;

  if (!key) {
    onReady?.(fallbackKey ?? "__MISSING__");
    return;
  }

  // Already in Phaser cache
  if (scene.textures.exists(key)) {
    onReady?.(key);
    return;
  }

  // Legacy textureKey (not a path) — non chargée → fallback
  if (!key.startsWith("/assets/")) {
    onReady?.(fallbackKey ?? key);
    return;
  }

  // AssetPath → chargement dynamique
  const img = new Image();
  img.onload = () => {
    if (!scene.textures.exists(key)) {
      scene.textures.addImage(key, img);
    }
    onReady?.(key);
  };
  img.onerror = () => {
    onReady?.(fallbackKey ?? key);
  };
  img.src = key;
}

/**
 * Version synchrone : retourne la key si déjà chargée, sinon déclenche
 * le chargement en arrière-plan et retourne fallbackKey immédiatement.
 * Utile pour les rendus initiaux (renderResources, loadBuildings).
 *
 * @param {Phaser.Scene} scene
 * @param {string|null} key
 * @param {string} fallbackKey
 * @returns {string} key utilisable immédiatement
 */
export function resolveOrLoad(scene, key, fallbackKey) {
  if (!key) return fallbackKey;
  if (scene.textures.exists(key)) return key;
  if (key.startsWith("/assets/")) {
    // Déclenche le chargement; les listeners devront upsert le sprite via update
    const img = new Image();
    img.onload = () => {
      if (!scene.textures.exists(key)) scene.textures.addImage(key, img);
    };
    img.src = key;
  }
  return fallbackKey;
}
