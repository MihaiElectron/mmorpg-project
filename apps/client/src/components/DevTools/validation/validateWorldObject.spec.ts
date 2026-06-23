import { describe, it, expect } from "vitest";
import { validateWorldObject } from "./validateWorldObject";
import type { WorldObject } from "../types/worldObject.types";

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeResource(overrides: Partial<WorldObject> = {}): WorldObject {
  return {
    kind: "entity",
    category: "resource",
    id: "r-test-1",
    type: "dead_tree",
    mapId: 1,
    position: { worldX: 1024, worldY: 2048 },
    state: "alive",
    remainingLoots: 3,
    capabilities: ["transform", "harvestable", "loot", "persistence", "validation"],
    metadata: { legacy: { x: 100, y: 200 } },
    ...overrides,
  };
}

function codes(obj: WorldObject) {
  return validateWorldObject(obj).map((d) => d.code);
}

// ── Règles génériques ─────────────────────────────────────────────────────────

describe("validateWorldObject — règles génériques", () => {
  it("objet valide resource alive → aucun diagnostic", () => {
    expect(validateWorldObject(makeResource())).toHaveLength(0);
  });

  it("id absent → MISSING_ID error", () => {
    const diags = validateWorldObject(makeResource({ id: "" }));
    const d = diags.find((x) => x.code === "MISSING_ID");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
  });

  it("category absente → MISSING_CATEGORY error", () => {
    const diags = validateWorldObject(makeResource({ category: "" }));
    const d = diags.find((x) => x.code === "MISSING_CATEGORY");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
  });

  it("type absent → MISSING_TYPE error", () => {
    const diags = validateWorldObject(makeResource({ type: "" }));
    const d = diags.find((x) => x.code === "MISSING_TYPE");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
  });

  it("state absent → MISSING_STATE error", () => {
    const diags = validateWorldObject(makeResource({ state: "" }));
    const d = diags.find((x) => x.code === "MISSING_STATE");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
  });

  it("mapId null → MISSING_MAP_ID warning", () => {
    const diags = validateWorldObject(makeResource({ mapId: null }));
    const d = diags.find((x) => x.code === "MISSING_MAP_ID");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("warning");
  });

  it("position null → MISSING_POSITION warning", () => {
    const diags = validateWorldObject(makeResource({ position: null }));
    const d = diags.find((x) => x.code === "MISSING_POSITION");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("warning");
  });

  it("capabilities vides → EMPTY_CAPABILITIES warning", () => {
    const diags = validateWorldObject(makeResource({ capabilities: [] }));
    const d = diags.find((x) => x.code === "EMPTY_CAPABILITIES");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("warning");
  });
});

// ── Règles resource ───────────────────────────────────────────────────────────

describe("validateWorldObject — règles resource", () => {
  it("remainingLoots < 0 → RESOURCE_NEGATIVE_LOOTS error", () => {
    const diags = validateWorldObject(makeResource({ remainingLoots: -1 }));
    const d = diags.find((x) => x.code === "RESOURCE_NEGATIVE_LOOTS");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
  });

  it("resource dead + remainingLoots > 0 → RESOURCE_DEAD_WITH_LOOTS warning", () => {
    const diags = validateWorldObject(
      makeResource({ state: "dead", remainingLoots: 2 }),
    );
    const d = diags.find((x) => x.code === "RESOURCE_DEAD_WITH_LOOTS");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("warning");
  });

  it("resource alive + remainingLoots === 0 → RESOURCE_ALIVE_NO_LOOTS info", () => {
    const diags = validateWorldObject(
      makeResource({ state: "alive", remainingLoots: 0 }),
    );
    const d = diags.find((x) => x.code === "RESOURCE_ALIVE_NO_LOOTS");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("info");
  });

  it("resource dead + remainingLoots === 0 → aucune règle resource déclenchée", () => {
    const resourceCodes = ["RESOURCE_NEGATIVE_LOOTS", "RESOURCE_DEAD_WITH_LOOTS", "RESOURCE_ALIVE_NO_LOOTS"];
    const triggered = codes(makeResource({ state: "dead", remainingLoots: 0 })).filter(
      (c) => resourceCodes.includes(c),
    );
    expect(triggered).toHaveLength(0);
  });

  it("metadata.respawnDelayMs <= 0 → RESOURCE_INVALID_RESPAWN_DELAY error", () => {
    const diags = validateWorldObject(
      makeResource({ metadata: { legacy: null, respawnDelayMs: 0 } }),
    );
    const d = diags.find((x) => x.code === "RESOURCE_INVALID_RESPAWN_DELAY");
    expect(d).toBeDefined();
    expect(d?.severity).toBe("error");
  });

  it("metadata.respawnDelayMs absent → pas de RESOURCE_INVALID_RESPAWN_DELAY", () => {
    const triggered = codes(makeResource({ metadata: { legacy: null } })).filter(
      (c) => c === "RESOURCE_INVALID_RESPAWN_DELAY",
    );
    expect(triggered).toHaveLength(0);
  });

  it("metadata.respawnDelayMs > 0 → pas de RESOURCE_INVALID_RESPAWN_DELAY", () => {
    const triggered = codes(
      makeResource({ metadata: { legacy: null, respawnDelayMs: 60_000 } }),
    ).filter((c) => c === "RESOURCE_INVALID_RESPAWN_DELAY");
    expect(triggered).toHaveLength(0);
  });
});

// ── Catégorie inconnue ────────────────────────────────────────────────────────

describe("validateWorldObject — catégorie inconnue", () => {
  it("catégorie inconnue → seulement règles génériques, pas de crash", () => {
    const obj: WorldObject = makeResource({ category: "portal" });
    expect(() => validateWorldObject(obj)).not.toThrow();
    const triggered = codes(obj).filter((c) => c.startsWith("RESOURCE_"));
    expect(triggered).toHaveLength(0);
  });
});
