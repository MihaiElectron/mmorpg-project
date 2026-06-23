import { describe, it, expect, vi } from "vitest";
import { STUDIO_COMMANDS, getCommand } from "./studioCommands";
import type { StudioCommandContext } from "./studioCommands";

function makeCtx(overrides: Partial<StudioCommandContext> = {}): StudioCommandContext {
  return {
    clearSelectedWorldObject: vi.fn(),
    incrementResourcesRefreshKey: vi.fn(),
    ...overrides,
  };
}

describe("STUDIO_COMMANDS — registre", () => {
  it("contient exactement deux commandes", () => {
    expect(STUDIO_COMMANDS).toHaveLength(2);
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
