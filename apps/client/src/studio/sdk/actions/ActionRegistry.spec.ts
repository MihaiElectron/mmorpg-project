import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionRegistry } from "./ActionRegistry";
import { resourceActionProvider } from "./ResourceActionProvider";
import { actionRegistry, getActionsForWorldObject } from "./index";
import type { ActionProvider, StudioAction } from "./ActionProvider";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";
import type { StudioCommandContext } from "../../../components/DevTools/commands/studioCommands";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWorldObject(capabilities: string[], category = "resource"): WorldObject {
  return {
    kind: "entity",
    category,
    id: "wo-test",
    type: "dead_tree",
    mapId: 1,
    position: null,
    state: "alive",
    capabilities,
    metadata: {},
  };
}

function makeAction(id: string): StudioAction {
  return {
    id,
    label: id,
    group: "test",
    enabled: () => true,
    run: vi.fn(),
  };
}

function makeProvider(capabilities: string[], actions: StudioAction[]): ActionProvider {
  return { capabilities, getActions: () => actions };
}

function makeCtx(overrides: Partial<StudioCommandContext> = {}): StudioCommandContext {
  return {
    clearSelectedWorldObject: vi.fn(),
    incrementResourcesRefreshKey: vi.fn(),
    incrementCreaturesRefreshKey: vi.fn(),
    incrementCreatureSpawnsRefreshKey: vi.fn(),
    selectedWorldObjectId: "wo-test",
    ...overrides,
  };
}

// ── ActionRegistry ────────────────────────────────────────────────────────────

describe("ActionRegistry", () => {
  let registry: ActionRegistry;

  beforeEach(() => {
    registry = new ActionRegistry();
  });

  it("getActionsFor retourne [] si aucun provider enregistré", () => {
    const obj = makeWorldObject(["harvestable"]);
    expect(registry.getActionsFor(obj)).toHaveLength(0);
  });

  it("getActionsFor retourne [] pour un WorldObject sans capabilities", () => {
    const action = makeAction("test.action");
    registry.register(makeProvider(["harvestable"], [action]));
    const obj = makeWorldObject([]);
    expect(registry.getActionsFor(obj)).toHaveLength(0);
  });

  it("getActionsFor retourne les actions du provider compatible", () => {
    const action = makeAction("test.action");
    registry.register(makeProvider(["harvestable"], [action]));
    const obj = makeWorldObject(["transform", "harvestable", "validation"]);
    expect(registry.getActionsFor(obj)).toContain(action);
  });

  it("getActionsFor retourne [] pour un WorldObject sans capability compatible", () => {
    const action = makeAction("test.action");
    registry.register(makeProvider(["harvestable"], [action]));
    const obj = makeWorldObject(["transform", "combat", "validation"]);
    expect(registry.getActionsFor(obj)).toHaveLength(0);
  });

  it("l'ordre d'insertion des providers est préservé", () => {
    const actionA = makeAction("a");
    const actionB = makeAction("b");
    registry.register(makeProvider(["cap-a"], [actionA]));
    registry.register(makeProvider(["cap-b"], [actionB]));
    const obj = makeWorldObject(["cap-a", "cap-b"]);
    const actions = registry.getActionsFor(obj);
    expect(actions[0]).toBe(actionA);
    expect(actions[1]).toBe(actionB);
  });

  it("getAllProviders retourne tous les providers dans l'ordre d'inscription", () => {
    const pA = makeProvider(["a"], []);
    const pB = makeProvider(["b"], []);
    registry.register(pA);
    registry.register(pB);
    expect(registry.getAllProviders()).toStrictEqual([pA, pB]);
  });

  it("plusieurs providers pour la même capability retournent toutes leurs actions", () => {
    const a1 = makeAction("a1");
    const a2 = makeAction("a2");
    registry.register(makeProvider(["shared"], [a1]));
    registry.register(makeProvider(["shared"], [a2]));
    const obj = makeWorldObject(["shared"]);
    const actions = registry.getActionsFor(obj);
    expect(actions).toContain(a1);
    expect(actions).toContain(a2);
  });
});

// ── ResourceActionProvider ────────────────────────────────────────────────────

describe("resourceActionProvider", () => {
  it("capabilities contient 'harvestable'", () => {
    expect(resourceActionProvider.capabilities).toContain("harvestable");
  });

  it("getActions retourne l'action resource.forceRespawn", () => {
    const obj = makeWorldObject(["harvestable"]);
    const actions = resourceActionProvider.getActions(obj);
    expect(actions.find((a) => a.id === "resource.forceRespawn")).toBeDefined();
  });

  it("action.group === 'instance'", () => {
    const obj = makeWorldObject(["harvestable"]);
    const action = resourceActionProvider.getActions(obj).find((a) => a.id === "resource.forceRespawn")!;
    expect(action.group).toBe("instance");
  });

  it("action.enabled() retourne true", () => {
    const obj = makeWorldObject(["harvestable"]);
    const action = resourceActionProvider.getActions(obj).find((a) => a.id === "resource.forceRespawn")!;
    expect(action.enabled(obj)).toBe(true);
  });

  it("action.run() appelle ctx.incrementResourcesRefreshKey si fetch réussit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue("tok") });

    const obj = makeWorldObject(["harvestable"]);
    const ctx = makeCtx({ selectedWorldObjectId: "res-xyz" });
    const action = resourceActionProvider.getActions(obj).find((a) => a.id === "resource.forceRespawn")!;

    await action.run(obj, ctx);
    expect(ctx.incrementResourcesRefreshKey).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it("action.run() ne rafraîchit pas si fetch échoue", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue("tok") });

    const obj = makeWorldObject(["harvestable"]);
    const ctx = makeCtx({ selectedWorldObjectId: "res-xyz" });
    const action = resourceActionProvider.getActions(obj).find((a) => a.id === "resource.forceRespawn")!;

    await action.run(obj, ctx);
    expect(ctx.incrementResourcesRefreshKey).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("action.run() ne fait rien si selectedWorldObjectId est null", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue(null) });

    const obj = makeWorldObject(["harvestable"]);
    const ctx = makeCtx({ selectedWorldObjectId: null });
    const action = resourceActionProvider.getActions(obj).find((a) => a.id === "resource.forceRespawn")!;

    await action.run(obj, ctx);
    expect(mockFetch).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

// ── getActionsForWorldObject (singleton) ──────────────────────────────────────

describe("getActionsForWorldObject", () => {
  it("retourne au moins resource.forceRespawn pour un objet harvestable", () => {
    const obj = makeWorldObject(["transform", "harvestable", "loot", "validation"]);
    const ids = getActionsForWorldObject(obj).map((a) => a.id);
    expect(ids).toContain("resource.forceRespawn");
  });

  it("retourne [] pour un objet sans capability reconnue", () => {
    const obj = makeWorldObject(["combat", "health", "validation"], "creature");
    expect(getActionsForWorldObject(obj)).toHaveLength(0);
  });

  it("retourne worldObject.focusCamera pour un objet avec transform", () => {
    const obj = makeWorldObject(["transform", "combat", "health"], "creature");
    const ids = getActionsForWorldObject(obj).map((a) => a.id);
    expect(ids).toContain("worldObject.focusCamera");
  });

  it("actionRegistry contient resourceActionProvider et positionActionProvider", () => {
    const providers = actionRegistry.getAllProviders();
    expect(providers).toContain(resourceActionProvider);
    expect(providers.some((p) => p.capabilities.includes("transform"))).toBe(true);
  });
});
