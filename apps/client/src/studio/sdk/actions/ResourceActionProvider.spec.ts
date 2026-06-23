import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resourceActionProvider } from "./ResourceActionProvider";
import { STUDIO_COMMANDS } from "../../../components/DevTools/commands/studioCommands";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";
import type { StudioCommandContext } from "../../../components/DevTools/commands/studioCommands";

function makeObj(overrides: Partial<WorldObject> = {}): WorldObject {
  return {
    kind: "entity",
    category: "resource",
    id: "r-1",
    type: "dead_tree",
    mapId: 1,
    position: { worldX: 32768, worldY: 16384 },
    state: "dead",
    capabilities: ["transform", "harvestable"],
    metadata: {},
    ...overrides,
  };
}

function makeCtx(overrides: Partial<StudioCommandContext> = {}): StudioCommandContext {
  return {
    clearSelectedWorldObject: vi.fn(),
    incrementResourcesRefreshKey: vi.fn(),
    incrementAnimalsRefreshKey: vi.fn(),
    incrementCreatureSpawnsRefreshKey: vi.fn(),
    selectedWorldObjectId: "r-1",
    ...overrides,
  };
}

// ── resourceActionProvider ────────────────────────────────────────────────────

describe("resourceActionProvider", () => {
  it("est déclenché par la capability harvestable", () => {
    expect(resourceActionProvider.capabilities).toContain("harvestable");
  });

  it("expose resource.forceRespawn et resource.resetFromTemplate", () => {
    const ids = resourceActionProvider.getActions(makeObj()).map((a) => a.id);
    expect(ids).toContain("resource.forceRespawn");
    expect(ids).toContain("resource.resetFromTemplate");
  });

  it("resetFromTemplate.enabled() retourne true", () => {
    const action = resourceActionProvider.getActions(makeObj()).find(
      (a) => a.id === "resource.resetFromTemplate",
    )!;
    expect(action.enabled(makeObj())).toBe(true);
  });

  it("resetFromTemplate.group est resource", () => {
    const action = resourceActionProvider.getActions(makeObj()).find(
      (a) => a.id === "resource.resetFromTemplate",
    )!;
    expect(action.group).toBe("resource");
  });
});

// ── commande resource.resetFromTemplate ───────────────────────────────────────

describe("STUDIO_COMMANDS — resource.resetFromTemplate", () => {
  const cmd = STUDIO_COMMANDS.find((c) => c.id === "resource.resetFromTemplate");

  it("existe dans STUDIO_COMMANDS", () => {
    expect(cmd).toBeDefined();
  });

  it("ne fait rien si selectedWorldObjectId est null", async () => {
    const ctx = makeCtx({ selectedWorldObjectId: null });
    await expect(cmd!.run(ctx)).resolves.not.toThrow();
    expect(ctx.incrementResourcesRefreshKey).not.toHaveBeenCalled();
  });

  describe("avec localStorage et fetch mockés", () => {
    beforeEach(() => {
      vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue("tok") });
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("appelle POST /admin/resources/:id/reset-from-template", async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
      const ctx = makeCtx({ selectedWorldObjectId: "r-abc" });
      await cmd!.run(ctx);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/admin/resources/r-abc/reset-from-template"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("appelle incrementResourcesRefreshKey si ok", async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
      const ctx = makeCtx();
      await cmd!.run(ctx);
      expect(ctx.incrementResourcesRefreshKey).toHaveBeenCalledTimes(1);
    });

    it("ne rafraîchit pas si la réponse est en erreur", async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
      const ctx = makeCtx();
      await cmd!.run(ctx);
      expect(ctx.incrementResourcesRefreshKey).not.toHaveBeenCalled();
    });
  });
});
