import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatWorldObjectInfo, worldObjectActionProvider } from "./WorldObjectActionProvider";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";

function makeObj(overrides: Partial<WorldObject> = {}): WorldObject {
  return {
    kind: "entity",
    category: "resource",
    id: "a1b2c3d4-dead-beef-cafe-112233445566",
    type: "dead_tree",
    mapId: 1,
    position: { worldX: 32768, worldY: 16384 },
    state: "alive",
    capabilities: ["transform", "harvestable", "loot", "persistence", "validation"],
    metadata: {},
    ...overrides,
  };
}

// ── formatWorldObjectInfo ──────────────────────────────────────────────────────

describe("formatWorldObjectInfo", () => {
  it("format avec position", () => {
    const result = formatWorldObjectInfo(makeObj());
    expect(result).toBe(
      "resource:dead_tree#a1b2c3d4-dead-beef-cafe-112233445566\n" +
      "mapId=1\n" +
      "worldX=32768\n" +
      "worldY=16384\n" +
      "state=alive\n" +
      "capabilities=transform,harvestable,loot,persistence,validation",
    );
  });

  it("format sans position : worldX/worldY affichés null", () => {
    const result = formatWorldObjectInfo(makeObj({ position: null }));
    expect(result).toContain("worldX=null");
    expect(result).toContain("worldY=null");
  });

  it("capabilities vides produit capabilities=", () => {
    const result = formatWorldObjectInfo(makeObj({ capabilities: [] }));
    expect(result).toContain("capabilities=");
    expect(result).not.toContain("transform");
  });

  it("id long conservé intégralement", () => {
    const longId = "00000000-1111-2222-3333-444444444444";
    const result = formatWorldObjectInfo(makeObj({ id: longId }));
    expect(result).toContain(`#${longId}`);
  });

  it("mapId null affiché null", () => {
    const result = formatWorldObjectInfo(makeObj({ mapId: null }));
    expect(result).toContain("mapId=null");
  });

  it("préfixe category:type#id sur la première ligne", () => {
    const obj = makeObj({ category: "creature_spawn", type: "turkey", id: "sp-1" });
    const firstLine = formatWorldObjectInfo(obj).split("\n")[0];
    expect(firstLine).toBe("creature_spawn:turkey#sp-1");
  });

  it("capabilities multiples séparées par virgule", () => {
    const obj = makeObj({ capabilities: ["transform", "combat", "health"] });
    const result = formatWorldObjectInfo(obj);
    expect(result).toContain("capabilities=transform,combat,health");
  });
});

// ── worldObjectActionProvider ─────────────────────────────────────────────────

describe("worldObjectActionProvider", () => {
  it("est déclenché par la capability transform", () => {
    expect(worldObjectActionProvider.capabilities).toContain("transform");
  });

  it("retourne l'action worldObject.copyInfo pour un objet avec transform", () => {
    const actions = worldObjectActionProvider.getActions(makeObj());
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe("worldObject.copyInfo");
  });

  it("enabled() retourne toujours true", () => {
    const [action] = worldObjectActionProvider.getActions(makeObj());
    expect(action.enabled(makeObj())).toBe(true);
    expect(action.enabled(makeObj({ position: null }))).toBe(true);
  });
});

// ── copyInfoAction.run ────────────────────────────────────────────────────────

describe("copyInfoAction.run", () => {
  const mockCtx = {} as any;

  beforeEach(() => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appelle navigator.clipboard.writeText avec le texte formaté", async () => {
    const obj = makeObj();
    const [action] = worldObjectActionProvider.getActions(obj);
    await action.run(obj, mockCtx);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(formatWorldObjectInfo(obj));
  });

  it("ne lève pas si navigator.clipboard est absent", async () => {
    vi.stubGlobal("navigator", {});
    const obj = makeObj();
    const [action] = worldObjectActionProvider.getActions(obj);
    await expect(action.run(obj, mockCtx)).resolves.not.toThrow();
  });
});
