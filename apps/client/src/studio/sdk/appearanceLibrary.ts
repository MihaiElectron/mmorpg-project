/**
 * appearanceLibrary.ts
 *
 * Source unique des apparences visuelles disponibles dans le Studio SDK.
 * Chaque AppearanceDefinition correspond à une texture Phaser chargée dans PreloadScene.
 *
 * Usage : importer `studioAppearanceRegistry` (singleton) et appeler les méthodes SDK.
 * Ne jamais déclarer CREATURE_TEXTURES, RESOURCE_TEXTURES, etc. ailleurs dans le projet.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type AppearanceCategory =
  | 'creature'
  | 'resource'
  | 'station'
  | 'npc'
  | 'decoration'
  | 'vegetation'
  | 'effect';

export interface AppearanceDefinition {
  readonly key: string;
  readonly name: string;
  readonly category: AppearanceCategory;
  /** Clé Phaser utilisée pour charger la texture (doit correspondre à un this.load.image(key, ...) dans PreloadScene). */
  readonly textureKey: string;
  /** Texture d'aperçu — identique à textureKey en Phase 1, peut diverger en Phase 2+. */
  readonly previewTextureKey: string;
  /** Chemin statique vers le fichier asset (pour <img> dans les formulaires React). Null si pas de preview disponible. */
  readonly previewSrc: string | null;
  readonly enabled: boolean;
}

// ── Définitions ────────────────────────────────────────────────────────────────

const APPEARANCE_DEFINITIONS: readonly AppearanceDefinition[] = Object.freeze([
  {
    key: 'turkey',
    name: 'Dinde',
    category: 'creature',
    textureKey: 'turkey',
    previewTextureKey: 'turkey',
    previewSrc: '/assets/bestiary/turkey_32.png',
    enabled: true,
  },
  {
    key: 'dead_tree',
    name: 'Arbre mort',
    category: 'resource',
    textureKey: 'dead_tree',
    previewTextureKey: 'dead_tree',
    previewSrc: '/assets/sprites/dead_tree.png',
    enabled: true,
  },
  {
    key: 'fire_camp',
    name: 'Feu de camp',
    category: 'resource',
    textureKey: 'fire_camp',
    previewTextureKey: 'fire_camp',
    previewSrc: '/assets/sprites/fire_camp.png',
    enabled: true,
  },
]);

// ── Registry ───────────────────────────────────────────────────────────────────

export class StudioAppearanceRegistry {
  private readonly defs: readonly AppearanceDefinition[];

  constructor(definitions: readonly AppearanceDefinition[]) {
    this.defs = definitions;
  }

  /** Toutes les apparences activées, toutes catégories confondues. */
  getAppearances(): readonly AppearanceDefinition[] {
    return this.defs.filter((d) => d.enabled);
  }

  /** Toutes les apparences (y compris désactivées). */
  getAllAppearances(): readonly AppearanceDefinition[] {
    return this.defs;
  }

  /** Apparences activées filtrées par catégorie. */
  getAppearancesByCategory(category: AppearanceCategory): readonly AppearanceDefinition[] {
    return this.defs.filter((d) => d.enabled && d.category === category);
  }

  /** Recherche une apparence par sa key. Retourne undefined si introuvable. */
  getAppearance(key: string): AppearanceDefinition | undefined {
    return this.defs.find((d) => d.key === key);
  }

  /** Retourne la textureKey Phaser pour une key donnée. Undefined si introuvable. */
  getTextureKey(key: string): string | undefined {
    return this.getAppearance(key)?.textureKey;
  }

  /**
   * Retourne la previewTextureKey pour une key donnée.
   * Fallback : retourne key telle quelle (WorldScene la cherchera dans le registre Phaser).
   */
  getPreviewTexture(key: string): string {
    return this.getAppearance(key)?.previewTextureKey ?? key;
  }

  /**
   * Retourne le chemin statique de l'image de prévisualisation.
   * Null si la key est inconnue ou si aucun previewSrc n'est défini.
   */
  getPreviewSrc(key: string): string | null {
    return this.getAppearance(key)?.previewSrc ?? null;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const studioAppearanceRegistry = new StudioAppearanceRegistry(APPEARANCE_DEFINITIONS);

export { APPEARANCE_DEFINITIONS };

// ── Helper de résolution Phaser ────────────────────────────────────────────────

/**
 * Résout la clé de texture Phaser à partir d'une apparence ou d'une clé directe.
 *
 * Ordre de priorité :
 *   1. Registry : getTextureKey(appearanceKey) si la key est connue dans l'Appearance Library
 *   2. textureKey directe si fournie et "chargée" (selon isLoaded)
 *   3. fallbackTextureKey
 *
 * Ne crashe jamais — retourne toujours une string.
 *
 * @param isLoaded - callback Phaser : `(key) => scene.textures.exists(key)`.
 *                   Si absent, textureKey est acceptée sans vérification de chargement.
 */
export function resolveAppearanceTexture({
  appearanceKey,
  textureKey,
  category: _category,
  fallbackTextureKey,
  isLoaded,
}: {
  appearanceKey?: string;
  textureKey?: string;
  /** Réservé pour filtrage futur — non utilisé en Phase 1. */
  category?: AppearanceCategory;
  fallbackTextureKey: string;
  isLoaded?: (key: string) => boolean;
}): string {
  if (appearanceKey) {
    const fromRegistry = studioAppearanceRegistry.getTextureKey(appearanceKey);
    if (fromRegistry !== undefined) return fromRegistry;
  }
  if (textureKey) {
    // AssetPath public — retourné tel quel (le caller doit avoir appelé loadTextureIfMissing)
    if (textureKey.startsWith('/assets/')) return textureKey;
    // textureKey Phaser legacy
    if (!isLoaded || isLoaded(textureKey)) return textureKey;
  }
  return fallbackTextureKey;
}
