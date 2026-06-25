import { describe, it, expect, vi } from "vitest";
import { STUDIO_COMMANDS, getCommand } from "./studioCommands";
import type { StudioCommandContext } from "./studioCommands";

function makeCtx(overrides: Partial<StudioCommandContext> = {}): StudioCommandContext {
  return {
    clearSelectedWorldObject: vi.fn(),
    incrementResourcesRefreshKey: vi.fn(),
    incrementCreaturesRefreshKey: vi.fn(),
    incrementCreatureSpawnsRefreshKey: vi.fn(),
    selectedWorldObjectId: null,
    ...overrides,
  };
}

describe("STUDIO_COMMANDS — registre", () => {
  it("contient au moins six commandes", () => {
    expect(STUDIO_COMMANDS.length).toBeGreaterThanOrEqual(6);
  });

  it("toutes les commandes ont id, label, description, run", () => {
    for (const cmd of STUDIO_COMMANDS) {
      expect(typeof cmd.id).toBe("string");
      expect(cmd.id.length).toBeGreaterThan(0);
      expect(typeof cmd.label).toBe("string");
      expect(typeof cmd.description).toBe("string");
      expect(typeof cmd.run).toBe("function");
    }
  });
});

describe("getCommand", () => {
  it("retourne la commande resource.refresh", () => {
    const cmd = getCommand("resource.refresh");
    expect(cmd).toBeDefined();
    expect(cmd?.id).toBe("resource.refresh");
  });

  it("retourne la commande resource.clearSelection", () => {
    const cmd = getCommand("resource.clearSelection");
    expect(cmd).toBeDefined();
    expect(cmd?.id).toBe("resource.clearSelection");
  });

  it("retourne undefined pour un id inconnu", () => {
    expect(getCommand("unknown.command")).toBeUndefined();
    expect(getCommand("")).toBeUndefined();
  });
});

describe("resource.refresh", () => {
  it("appelle incrementResourcesRefreshKey", () => {
    const ctx = makeCtx();
    getCommand("resource.refresh")!.run(ctx);
    expect(ctx.incrementResourcesRefreshKey).toHaveBeenCalledOnce();
    expect(ctx.clearSelectedWorldObject).not.toHaveBeenCalled();
  });
});

describe("resource.clearSelection", () => {
  it("appelle clearSelectedWorldObject", () => {
    const ctx = makeCtx();
    getCommand("resource.clearSelection")!.run(ctx);
    expect(ctx.clearSelectedWorldObject).toHaveBeenCalledOnce();
    expect(ctx.incrementResourcesRefreshKey).not.toHaveBeenCalled();
  });
});

describe("resource.forceRespawn", () => {
  it("est enregistré dans STUDIO_COMMANDS", () => {
    expect(getCommand("resource.forceRespawn")).toBeDefined();
  });

  it("ne fait rien si selectedWorldObjectId est null", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue(null) });
    const ctx = makeCtx({ selectedWorldObjectId: null });
    await getCommand("resource.forceRespawn")!.run(ctx);
    expect(mockFetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("appelle POST /admin/resources/:id/force-respawn avec le bon ID", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue("tok") });
    const ctx = makeCtx({ selectedWorldObjectId: "res-abc" });
    await getCommand("resource.forceRespawn")!.run(ctx);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/resources/res-abc/force-respawn"),
      expect.objectContaining({ method: "POST" }),
    );
    vi.unstubAllGlobals();
  });

  it("appelle incrementResourcesRefreshKey si la réponse est ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue(null) });
    const ctx = makeCtx({ selectedWorldObjectId: "res-abc" });
    await getCommand("resource.forceRespawn")!.run(ctx);
    expect(ctx.incrementResourcesRefreshKey).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("ne rafraîchit pas si la réponse n'est pas ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    vi.stubGlobal("localStorage", { getItem: vi.fn().mockReturnValue(null) });
    const ctx = makeCtx({ selectedWorldObjectId: "res-abc" });
    await getCommand("resource.forceRespawn")!.run(ctx);
    expect(ctx.incrementResourcesRefreshKey).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
