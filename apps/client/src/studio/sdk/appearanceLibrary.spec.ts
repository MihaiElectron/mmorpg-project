import { describe, it, expect } from 'vitest';
import {
  StudioAppearanceRegistry,
  studioAppearanceRegistry,
  APPEARANCE_DEFINITIONS,
  type AppearanceCategory,
} from './appearanceLibrary';

describe('StudioAppearanceRegistry — singleton', () => {
  it('getAppearances retourne uniquement les apparences activées', () => {
    const results = studioAppearanceRegistry.getAppearances();
    expect(results.every((a) => a.enabled)).toBe(true);
  });

  it('getAllAppearances retourne toutes les apparences y compris désactivées', () => {
    const all = studioAppearanceRegistry.getAllAppearances();
    expect(all.length).toBeGreaterThanOrEqual(studioAppearanceRegistry.getAppearances().length);
  });

  it('getAppearancesByCategory(creature) contient turkey', () => {
    const creatures = studioAppearanceRegistry.getAppearancesByCategory('creature');
    expect(creatures.some((a) => a.key === 'turkey')).toBe(true);
  });

  it('getAppearancesByCategory(resource) contient dead_tree et fire_camp', () => {
    const resources = studioAppearanceRegistry.getAppearancesByCategory('resource');
    const keys = resources.map((a) => a.key);
    expect(keys).toContain('dead_tree');
    expect(keys).toContain('fire_camp');
  });

  it('getAppearancesByCategory(creature) ne contient pas de ressources', () => {
    const creatures = studioAppearanceRegistry.getAppearancesByCategory('creature');
    expect(creatures.every((a) => a.category === 'creature')).toBe(true);
  });

  it('getAppearancesByCategory(resource) ne contient pas de créatures', () => {
    const resources = studioAppearanceRegistry.getAppearancesByCategory('resource');
    expect(resources.every((a) => a.category === 'resource')).toBe(true);
  });

  it('getAppearance(turkey) retourne la définition turkey', () => {
    const a = studioAppearanceRegistry.getAppearance('turkey');
    expect(a).toBeDefined();
    expect(a!.name).toBe('Dinde');
    expect(a!.category).toBe('creature');
    expect(a!.textureKey).toBe('turkey');
  });

  it('getAppearance(dead_tree) retourne la définition dead_tree', () => {
    const a = studioAppearanceRegistry.getAppearance('dead_tree');
    expect(a).toBeDefined();
    expect(a!.category).toBe('resource');
  });

  it('getAppearance(fire_camp) retourne la définition fire_camp', () => {
    const a = studioAppearanceRegistry.getAppearance('fire_camp');
    expect(a).toBeDefined();
    expect(a!.category).toBe('resource');
  });

  it('getAppearance retourne undefined pour une key inconnue', () => {
    expect(studioAppearanceRegistry.getAppearance('unknown_key')).toBeUndefined();
  });

  it('getTextureKey retourne la textureKey de l\'apparence', () => {
    expect(studioAppearanceRegistry.getTextureKey('turkey')).toBe('turkey');
    expect(studioAppearanceRegistry.getTextureKey('dead_tree')).toBe('dead_tree');
  });

  it('getTextureKey retourne undefined pour une key inconnue', () => {
    expect(studioAppearanceRegistry.getTextureKey('unknown_key')).toBeUndefined();
  });

  it('getPreviewTexture retourne previewTextureKey pour une key connue', () => {
    expect(studioAppearanceRegistry.getPreviewTexture('turkey')).toBe('turkey');
    expect(studioAppearanceRegistry.getPreviewTexture('fire_camp')).toBe('fire_camp');
  });

  it('getPreviewTexture retourne la key elle-même comme fallback si inconnue', () => {
    expect(studioAppearanceRegistry.getPreviewTexture('unknown_key')).toBe('unknown_key');
  });

  it('getPreviewSrc retourne le chemin fichier pour turkey', () => {
    expect(studioAppearanceRegistry.getPreviewSrc('turkey')).toBe('/assets/bestiary/turkey_32.png');
  });

  it('getPreviewSrc retourne le chemin fichier pour dead_tree', () => {
    expect(studioAppearanceRegistry.getPreviewSrc('dead_tree')).toBe('/assets/sprites/dead_tree.png');
  });

  it('getPreviewSrc retourne le chemin fichier pour fire_camp', () => {
    expect(studioAppearanceRegistry.getPreviewSrc('fire_camp')).toBe('/assets/sprites/fire_camp.png');
  });

  it('getPreviewSrc retourne null pour une key inconnue', () => {
    expect(studioAppearanceRegistry.getPreviewSrc('unknown_key')).toBeNull();
  });
});

describe('StudioAppearanceRegistry — instance isolée', () => {
  it('apparence désactivée exclue de getAppearances mais présente dans getAllAppearances', () => {
    const defs = [
      { key: 'a', name: 'A', category: 'creature' as AppearanceCategory, textureKey: 'a', previewTextureKey: 'a', previewSrc: null, enabled: true },
      { key: 'b', name: 'B', category: 'creature' as AppearanceCategory, textureKey: 'b', previewTextureKey: 'b', previewSrc: null, enabled: false },
    ];
    const reg = new StudioAppearanceRegistry(defs);
    expect(reg.getAppearances().length).toBe(1);
    expect(reg.getAllAppearances().length).toBe(2);
    expect(reg.getAppearancesByCategory('creature').length).toBe(1);
  });

  it('filtrage catégorie retourne seulement la catégorie demandée', () => {
    const defs = [
      { key: 'c', name: 'C', category: 'creature' as AppearanceCategory, textureKey: 'c', previewTextureKey: 'c', previewSrc: null, enabled: true },
      { key: 'r', name: 'R', category: 'resource' as AppearanceCategory, textureKey: 'r', previewTextureKey: 'r', previewSrc: null, enabled: true },
    ];
    const reg = new StudioAppearanceRegistry(defs);
    expect(reg.getAppearancesByCategory('creature').length).toBe(1);
    expect(reg.getAppearancesByCategory('resource').length).toBe(1);
    expect(reg.getAppearancesByCategory('station').length).toBe(0);
  });
});

describe('APPEARANCE_DEFINITIONS — intégrité', () => {
  it('chaque key est unique', () => {
    const keys = APPEARANCE_DEFINITIONS.map((d) => d.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('chaque textureKey correspond à la key en Phase 1', () => {
    APPEARANCE_DEFINITIONS.forEach((d) => {
      expect(d.textureKey).toBeTruthy();
    });
  });

  it('chaque previewTextureKey est défini', () => {
    APPEARANCE_DEFINITIONS.forEach((d) => {
      expect(typeof d.previewTextureKey).toBe('string');
    });
  });
});
