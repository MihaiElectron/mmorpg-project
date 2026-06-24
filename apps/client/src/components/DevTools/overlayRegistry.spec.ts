import { describe, it, expect, vi } from "vitest";
import { getOverlayBinding, type OverlayBindingsMap } from "./overlayRegistry";

function makeMap(overrides: Partial<OverlayBindingsMap> = {}): OverlayBindingsMap {
  return {
    resourceOverlayEnabled: false,
    toggleResourceOverlayEnabled: vi.fn(),
    animalOverlayEnabled: false,
    toggleAnimalOverlayEnabled: vi.fn(),
    creatureSpawnOverlayEnabled: false,
    toggleCreatureSpawnOverlayEnabled: vi.fn(),
    stationRadiusOverlayEnabled: false,
    toggleStationRadiusOverlayEnabled: vi.fn(),
    walkabilityOverlayEnabled: false,
    toggleWalkabilityOverlayEnabled: vi.fn(),
    tileCoordinatesOverlayEnabled: false,
    toggleTileCoordinatesOverlayEnabled: vi.fn(),
    ...overrides,
  };
}

describe("getOverlayBinding", () => {
  describe("overlays connus", () => {
    it("resource.overlay — enabled false par défaut", () => {
      const binding = getOverlayBinding("resource.overlay", makeMap());
      expect(binding).not.toBeNull();
      expect(binding!.enabled).toBe(false);
    });

    it("resource.overlay — enabled true si resourceOverlayEnabled=true", () => {
      const binding = getOverlayBinding("resource.overlay", makeMap({ resourceOverlayEnabled: true }));
      expect(binding!.enabled).toBe(true);
    });

    it("resource.overlay — toggle appelle toggleResourceOverlayEnabled", () => {
      const toggle = vi.fn();
      const binding = getOverlayBinding("resource.overlay", makeMap({ toggleResourceOverlayEnabled: toggle }));
      binding!.toggle();
      expect(toggle).toHaveBeenCalledOnce();
    });

    it("animal.overlay — enabled false par défaut", () => {
      const binding = getOverlayBinding("animal.overlay", makeMap());
      expect(binding).not.toBeNull();
      expect(binding!.enabled).toBe(false);
    });

    it("animal.overlay — enabled true si animalOverlayEnabled=true", () => {
      const binding = getOverlayBinding("animal.overlay", makeMap({ animalOverlayEnabled: true }));
      expect(binding!.enabled).toBe(true);
    });

    it("animal.overlay — toggle appelle toggleAnimalOverlayEnabled", () => {
      const toggle = vi.fn();
      const binding = getOverlayBinding("animal.overlay", makeMap({ toggleAnimalOverlayEnabled: toggle }));
      binding!.toggle();
      expect(toggle).toHaveBeenCalledOnce();
    });

    it("creature_spawn.overlay — enabled false par défaut", () => {
      const binding = getOverlayBinding("creature_spawn.overlay", makeMap());
      expect(binding).not.toBeNull();
      expect(binding!.enabled).toBe(false);
    });

    it("creature_spawn.overlay — enabled true si creatureSpawnOverlayEnabled=true", () => {
      const binding = getOverlayBinding(
        "creature_spawn.overlay",
        makeMap({ creatureSpawnOverlayEnabled: true }),
      );
      expect(binding!.enabled).toBe(true);
    });

    it("creature_spawn.overlay — toggle appelle toggleCreatureSpawnOverlayEnabled", () => {
      const toggle = vi.fn();
      const binding = getOverlayBinding(
        "creature_spawn.overlay",
        makeMap({ toggleCreatureSpawnOverlayEnabled: toggle }),
      );
      binding!.toggle();
      expect(toggle).toHaveBeenCalledOnce();
    });

    it("station_radius.overlay — enabled true si stationRadiusOverlayEnabled=true", () => {
      const binding = getOverlayBinding(
        "station_radius.overlay",
        makeMap({ stationRadiusOverlayEnabled: true }),
      );
      expect(binding!.enabled).toBe(true);
    });

    it("station_radius.overlay — toggle appelle toggleStationRadiusOverlayEnabled", () => {
      const toggle = vi.fn();
      const binding = getOverlayBinding(
        "station_radius.overlay",
        makeMap({ toggleStationRadiusOverlayEnabled: toggle }),
      );
      binding!.toggle();
      expect(toggle).toHaveBeenCalledOnce();
    });
  });

  describe("overlay inconnu", () => {
    it("id inconnu retourne null sans crash", () => {
      expect(getOverlayBinding("unknown.overlay", makeMap())).toBeNull();
    });

    it("id vide retourne null sans crash", () => {
      expect(getOverlayBinding("", makeMap())).toBeNull();
    });

    it("id partiellement similaire retourne null", () => {
      expect(getOverlayBinding("resource", makeMap())).toBeNull();
      expect(getOverlayBinding("resource.overlay2", makeMap())).toBeNull();
    });
  });
});
