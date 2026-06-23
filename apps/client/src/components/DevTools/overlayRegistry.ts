/**
 * Mapping temporaire entre les ids d'overlay déclarés par le SDK et les champs de store.
 * Ce fichier sera supprimé quand le store sera lui-même piloté par les providers.
 */

export interface OverlayStoreBinding {
  readonly enabled: boolean;
  readonly toggle: () => void;
}

export interface OverlayBindingsMap {
  resourceOverlayEnabled: boolean;
  toggleResourceOverlayEnabled: () => void;
  animalOverlayEnabled: boolean;
  toggleAnimalOverlayEnabled: () => void;
  creatureSpawnOverlayEnabled: boolean;
  toggleCreatureSpawnOverlayEnabled: () => void;
}

/**
 * Retourne le binding store pour un overlay déclaré par le SDK.
 * Retourne null pour les ids inconnus — le consommateur peut alors désactiver le contrôle.
 */
export function getOverlayBinding(
  overlayId: string,
  map: OverlayBindingsMap,
): OverlayStoreBinding | null {
  switch (overlayId) {
    case "resource.overlay":
      return { enabled: map.resourceOverlayEnabled, toggle: map.toggleResourceOverlayEnabled };
    case "animal.overlay":
      return { enabled: map.animalOverlayEnabled, toggle: map.toggleAnimalOverlayEnabled };
    case "creature_spawn.overlay":
      return {
        enabled: map.creatureSpawnOverlayEnabled,
        toggle: map.toggleCreatureSpawnOverlayEnabled,
      };
    default:
      return null;
  }
}
