import { describe, it, expect, vi } from "vitest";
import { CapabilityRegistry } from "./CapabilityRegistry";
import { resourceCommandProvider } from "./ResourceCommandProvider";
import { isCommandProvider } from "./CapabilityProvider";
import { getCommandsForWorldObject } from "./index";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";
import type { StudioCommandContext } from "../../../components/DevTools/commands/studioCommands";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWorldObject(capabilities: string[]): WorldObject {
  return {
    kind: "entity",
    category: "resource",
    id: "r-test",
    type: "dead_tree",
    mapId: 1,
    position: null,
    state: "alive",
    capabilities,
    metadata: {},
  };
}

function makeCtx(): StudioCommandContext {
  return {
    clearSelectedWorldObject: vi.fn(),
    incrementResourcesRefreshKey: vi.fn(),
    incrementCreaturesRefreshKey: vi.fn(),
    incrementCreatureSpawnsRefreshKey: vi.fn(),
    selectedWorldObjectId: null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resourceCommandProvider", () => {
  it('déclare la capability "harvestable"', () => {
    expect(resourceCommandProvider.capabilities).toContain("harvestable");
  });

  it("kind === 'command'", () => {
    expect(resourceCommandProvider.kind).toBe("command");
  });

  it("reconnu par isCommandProvider", () => {
    expect(isCommandProvider(resourceCommandProvider)).toBe(true);
  });

  it("getCommands retourne resource.refresh, resource.clearSelection et resource.forceRespawn", () => {
    const ctx = makeCtx();
    const cmds = resourceCommandProvider.getCommands(ctx);
    const ids = cmds.map((c) => c.id);
    expect(ids).toContain("resource.refresh");
    expect(ids).toContain("resource.clearSelection");
    expect(ids).toContain("resource.forceRespawn");
  });

  it("getCommands ne retourne que les commandes resource", () => {
    const ctx = makeCtx();
    const cmds = resourceCommandProvider.getCommands(ctx);
    const ids = cmds.map((c) => c.id);
    expect(ids).not.toContain("creature.refresh");
    expect(ids).not.toContain("creature_spawn.refresh");
  });
});

describe("resourceCommandProvider via CapabilityRegistry", () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    registry.register(resourceCommandProvider);
  });

  it("trouvé pour un WorldObject avec capability 'harvestable'", () => {
    const obj = makeWorldObject(["transform", "harvestable", "validation"]);
    expect(registry.getProvidersFor(obj)).toContain(resourceCommandProvider);
  });

  it("non trouvé pour un WorldObject sans 'harvestable'", () => {
    const obj = makeWorldObject(["transform", "validation"]);
    expect(registry.getProvidersFor(obj)).not.toContain(resourceCommandProvider);
  });
});

describe("getCommandsForWorldObject", () => {
  it("retourne les commandes resource pour un WorldObject harvestable", () => {
    const obj = makeWorldObject(["transform", "harvestable", "loot", "persistence", "validation"]);
    const ctx = makeCtx();
    const cmds = getCommandsForWorldObject(obj, ctx);
    const ids = cmds.map((c) => c.id);
    expect(ids).toContain("resource.refresh");
    expect(ids).toContain("resource.clearSelection");
  });

  it("retourne tableau vide pour un WorldObject sans 'harvestable'", () => {
    const obj = makeWorldObject(["transform", "combat", "validation"]);
    const ctx = makeCtx();
    const cmds = getCommandsForWorldObject(obj, ctx);
    // Aucun CommandProvider enregistré pour ces capabilities
    expect(cmds.every((c) => !c.id.startsWith("resource."))).toBe(true);
  });

  it("les commandes retournées sont exécutables via run(ctx)", async () => {
    const obj = makeWorldObject(["harvestable"]);
    const ctx = makeCtx();
    const cmds = getCommandsForWorldObject(obj, ctx);
    const refresh = cmds.find((c) => c.id === "resource.refresh");
    expect(refresh).toBeDefined();
    await refresh!.run(ctx);
    expect(ctx.incrementResourcesRefreshKey).toHaveBeenCalledOnce();
  });
});
