import { describe, it, expect, beforeEach } from "vitest";
import { CapabilityRegistry } from "./CapabilityRegistry";
import { resourceOverlayProvider } from "./ResourceOverlayProvider";
import { animalOverlayProvider } from "./AnimalOverlayProvider";
import { creatureSpawnOverlayProvider } from "./CreatureSpawnOverlayProvider";
import { stationRadiusOverlayProvider } from "./StationRadiusOverlayProvider";
import { isOverlayProvider } from "./CapabilityProvider";
import { getAllOverlayDefinitions, getOverlaysForWorldObject } from "./index";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWorldObject(capabilities: string[], category = "resource"): WorldObject {
  return {
    kind: "entity",
    category,
    id: "test-id",
    type: "dead_tree",
    mapId: 1,
    position: null,
    state: "alive",
    capabilities,
    metadata: {},
  };
}

// ── Définitions des providers ─────────────────────────────────────────────────

describe("providers — structure", () => {
  it("resourceOverlayProvider : kind overlay, capability harvestable", () => {
    expect(resourceOverlayProvider.kind).toBe("overlay");
    expect(resourceOverlayProvider.capabilities).toContain("harvestable");
    expect(isOverlayProvider(resourceOverlayProvider)).toBe(true);
  });

  it("animalOverlayProvider : kind overlay, capability combat", () => {
    expect(animalOverlayProvider.kind).toBe("overlay");
    expect(animalOverlayProvider.capabilities).toContain("combat");
    expect(isOverlayProvider(animalOverlayProvider)).toBe(true);
  });

  it("creatureSpawnOverlayProvider : kind overlay, capability spawn", () => {
    expect(creatureSpawnOverlayProvider.kind).toBe("overlay");
    expect(creatureSpawnOverlayProvider.capabilities).toContain("spawn");
    expect(isOverlayProvider(creatureSpawnOverlayProvider)).toBe(true);
  });

  it("stationRadiusOverlayProvider : kind overlay, capability crafting_station", () => {
    expect(stationRadiusOverlayProvider.kind).toBe("overlay");
    expect(stationRadiusOverlayProvider.capabilities).toContain("crafting_station");
    expect(isOverlayProvider(stationRadiusOverlayProvider)).toBe(true);
  });
});

describe("providers — getOverlays()", () => {
  it("resourceOverlayProvider retourne resource.overlay", () => {
    const defs = resourceOverlayProvider.getOverlays();
    expect(defs).toHaveLength(1);
    expect(defs[0].id).toBe("resource.overlay");
    expect(defs[0].category).toBe("resource");
  });

  it("animalOverlayProvider retourne animal.overlay", () => {
    const defs = animalOverlayProvider.getOverlays();
    expect(defs).toHaveLength(1);
    expect(defs[0].id).toBe("animal.overlay");
    expect(defs[0].category).toBe("animal");
  });

  it("creatureSpawnOverlayProvider retourne creature_spawn.overlay", () => {
    const defs = creatureSpawnOverlayProvider.getOverlays();
    expect(defs).toHaveLength(1);
    expect(defs[0].id).toBe("creature_spawn.overlay");
    expect(defs[0].category).toBe("creature_spawn");
  });

  it("stationRadiusOverlayProvider retourne station_radius.overlay", () => {
    const defs = stationRadiusOverlayProvider.getOverlays();
    expect(defs).toHaveLength(1);
    expect(defs[0].id).toBe("station_radius.overlay");
    expect(defs[0].category).toBe("crafting_station");
  });
});

// ── Via CapabilityRegistry ────────────────────────────────────────────────────

describe("CapabilityRegistry — overlay providers", () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register(resourceOverlayProvider);
    registry.register(animalOverlayProvider);
    registry.register(creatureSpawnOverlayProvider);
    registry.register(stationRadiusOverlayProvider);
  });

  it("WorldObject harvestable → resourceOverlayProvider retourné", () => {
    const obj = makeWorldObject(["transform", "harvestable", "loot", "validation"]);
    expect(registry.getProvidersFor(obj)).toContain(resourceOverlayProvider);
  });

  it("WorldObject combat → animalOverlayProvider retourné", () => {
    const obj = makeWorldObject(["transform", "combat", "health", "validation"], "animal");
    expect(registry.getProvidersFor(obj)).toContain(animalOverlayProvider);
  });

  it("WorldObject spawn → creatureSpawnOverlayProvider retourné", () => {
    const obj = makeWorldObject(["transform", "spawn", "patrol", "validation"], "creature_spawn");
    expect(registry.getProvidersFor(obj)).toContain(creatureSpawnOverlayProvider);
  });

  it("WorldObject crafting_station → stationRadiusOverlayProvider retourné", () => {
    const obj = makeWorldObject(["crafting_station", "placement", "validation"], "crafting_station");
    expect(registry.getProvidersFor(obj)).toContain(stationRadiusOverlayProvider);
  });

  it("WorldObject sans capability connue → aucun overlay provider", () => {
    const obj = makeWorldObject(["transform", "persistence"]);
    const overlayProviders = registry.getProvidersFor(obj).filter(isOverlayProvider);
    expect(overlayProviders).toHaveLength(0);
  });
});

// ── getAllOverlayDefinitions ───────────────────────────────────────────────────

describe("getAllOverlayDefinitions", () => {
  it("retourne exactement 6 définitions", () => {
    const defs = getAllOverlayDefinitions();
    expect(defs).toHaveLength(6);
  });

  it("contient les overlays connus", () => {
    const ids = getAllOverlayDefinitions().map((d) => d.id);
    expect(ids).toContain("resource.overlay");
    expect(ids).toContain("animal.overlay");
    expect(ids).toContain("creature_spawn.overlay");
    expect(ids).toContain("station_radius.overlay");
    expect(ids).toContain("walkability.overlay");
    expect(ids).toContain("tile_coordinates.overlay");
  });

  it("chaque définition a id, label, category, capability non vides", () => {
    for (const def of getAllOverlayDefinitions()) {
      expect(typeof def.id).toBe("string");
      expect(def.id.length).toBeGreaterThan(0);
      expect(typeof def.label).toBe("string");
      expect(typeof def.category).toBe("string");
      expect(typeof def.capability).toBe("string");
    }
  });
});

// ── getOverlaysForWorldObject ─────────────────────────────────────────────────

describe("getOverlaysForWorldObject", () => {
  it("resource WorldObject → resource.overlay", () => {
    const obj = makeWorldObject(["transform", "harvestable", "loot", "persistence", "validation"]);
    const defs = getOverlaysForWorldObject(obj);
    expect(defs.find((d) => d.id === "resource.overlay")).toBeDefined();
  });

  it("animal WorldObject → animal.overlay", () => {
    const obj = makeWorldObject(["transform", "combat", "health", "persistence", "validation"], "animal");
    const defs = getOverlaysForWorldObject(obj);
    expect(defs.find((d) => d.id === "animal.overlay")).toBeDefined();
  });

  it("crafting station WorldObject → station_radius.overlay", () => {
    const obj = makeWorldObject(["crafting_station", "placement", "validation"], "crafting_station");
    const defs = getOverlaysForWorldObject(obj);
    expect(defs.find((d) => d.id === "station_radius.overlay")).toBeDefined();
  });

  it("capability inconnue → tableau vide", () => {
    const obj = makeWorldObject(["unknown_cap", "other_cap"]);
    expect(getOverlaysForWorldObject(obj)).toHaveLength(0);
  });
});
