// apps/client/src/components/DevTools/modules/PlayerRuntime/runtimeApi.spec.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchSnapshot,
  addDebugModifier,
  clearDebugModifiers,
  listDebugModifiers,
} from "./runtimeApi";
import type { PlayerRuntimeSnapshot, RuntimeModifier, ModifierFormInput } from "./player-runtime.types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<PlayerRuntimeSnapshot> = {}): PlayerRuntimeSnapshot {
  return {
    characterId: "char-1",
    name: "Hero",
    baseStats: { level: 1, health: 100, maxHealth: 100, attack: 10, defense: 5, experience: 0 },
    derivedStats: { maxHp: 100, attackPower: 10, defenseTotal: 5, speed: 0, gatheringRange: 0, attackRange: 0 },
    sources: [],
    modifiers: [],
    trace: { stats: {}, modifierCount: 0, computedAt: "2026-01-01T00:00:00Z" },
    computedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeModifier(overrides: Partial<RuntimeModifier> = {}): RuntimeModifier {
  return {
    id: "debug:char-1:1",
    sourceType: "debug",
    sourceLabel: "Debug",
    targetStat: "attackPower",
    operation: "flat",
    value: 10,
    priority: 99,
    enabled: true,
    ...overrides,
  };
}

function makeFormInput(overrides: Partial<ModifierFormInput> = {}): ModifierFormInput {
  return { targetStat: "attackPower", operation: "flat", value: 10, ...overrides };
}

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status, json: () => Promise.resolve({}) } as unknown as Response;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
const mockLocalStorage = { getItem: vi.fn().mockReturnValue("test-token") };

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("localStorage", mockLocalStorage);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── fetchSnapshot ────────────────────────────────────────────────────────────

describe("fetchSnapshot", () => {
  it("appelle le bon endpoint snapshot", async () => {
    const snap = makeSnapshot();
    mockFetch.mockResolvedValue(okJson(snap));

    await fetchSnapshot();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/player-runtime/me/snapshot");
  });

  it("envoie le header Authorization", async () => {
    mockFetch.mockResolvedValue(okJson(makeSnapshot()));

    await fetchSnapshot();

    const [, options] = mockFetch.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token");
  });

  it("retourne le snapshot parsé", async () => {
    const snap = makeSnapshot({ name: "Warrior" });
    mockFetch.mockResolvedValue(okJson(snap));

    const result = await fetchSnapshot();

    expect(result.name).toBe("Warrior");
    expect(result.characterId).toBe("char-1");
  });

  it("lève une erreur sur réponse non-ok", async () => {
    mockFetch.mockResolvedValue(errorResponse(401));

    await expect(fetchSnapshot()).rejects.toThrow("HTTP 401");
  });

  it("lève une erreur 500", async () => {
    mockFetch.mockResolvedValue(errorResponse(500));

    await expect(fetchSnapshot()).rejects.toThrow("HTTP 500");
  });
});

// ─── addDebugModifier ─────────────────────────────────────────────────────────

describe("addDebugModifier", () => {
  it("envoie une requête POST", async () => {
    mockFetch.mockResolvedValue(okJson({ added: makeModifier() }));

    await addDebugModifier("char-1", makeFormInput());

    const [, options] = mockFetch.mock.calls[0];
    expect(options?.method).toBe("POST");
  });

  it("appelle le bon endpoint", async () => {
    mockFetch.mockResolvedValue(okJson({ added: makeModifier() }));

    await addDebugModifier("char-1", makeFormInput());

    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/player-runtime/debug/modifiers");
  });

  it("inclut characterId et input dans le body", async () => {
    mockFetch.mockResolvedValue(okJson({ added: makeModifier() }));
    const input = makeFormInput({ targetStat: "maxHp", operation: "percent_add", value: 20 });

    await addDebugModifier("char-42", input);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body.characterId).toBe("char-42");
    expect(body.targetStat).toBe("maxHp");
    expect(body.operation).toBe("percent_add");
    expect(body.value).toBe(20);
  });

  it("transmet sourceLabel et reason optionnels", async () => {
    mockFetch.mockResolvedValue(okJson({ added: makeModifier() }));
    const input = makeFormInput({ sourceLabel: "Test Buff", reason: "CI" });

    await addDebugModifier("char-1", input);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options?.body as string);
    expect(body.sourceLabel).toBe("Test Buff");
    expect(body.reason).toBe("CI");
  });

  it("envoie Content-Type application/json", async () => {
    mockFetch.mockResolvedValue(okJson({ added: makeModifier() }));

    await addDebugModifier("char-1", makeFormInput());

    const [, options] = mockFetch.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("retourne le modifier créé (data.added)", async () => {
    const mod = makeModifier({ value: 25 });
    mockFetch.mockResolvedValue(okJson({ added: mod }));

    const result = await addDebugModifier("char-1", makeFormInput());

    expect(result).toEqual(mod);
    expect(result.value).toBe(25);
  });

  it("lève une erreur sur réponse non-ok", async () => {
    mockFetch.mockResolvedValue(errorResponse(403));

    await expect(addDebugModifier("char-1", makeFormInput())).rejects.toThrow("HTTP 403");
  });
});

// ─── clearDebugModifiers ──────────────────────────────────────────────────────

describe("clearDebugModifiers", () => {
  it("envoie une requête DELETE", async () => {
    mockFetch.mockResolvedValue(okJson({ cleared: true }));

    await clearDebugModifiers("char-1");

    const [, options] = mockFetch.mock.calls[0];
    expect(options?.method).toBe("DELETE");
  });

  it("cible le bon endpoint avec le characterId", async () => {
    mockFetch.mockResolvedValue(okJson({ cleared: true }));

    await clearDebugModifiers("char-42");

    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/player-runtime/debug/modifiers/char-42");
  });

  it("envoie le header Authorization", async () => {
    mockFetch.mockResolvedValue(okJson({ cleared: true }));

    await clearDebugModifiers("char-1");

    const [, options] = mockFetch.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token");
  });

  it("ne retourne rien (void)", async () => {
    mockFetch.mockResolvedValue(okJson({ cleared: true }));

    const result = await clearDebugModifiers("char-1");

    expect(result).toBeUndefined();
  });

  it("lève une erreur sur réponse non-ok", async () => {
    mockFetch.mockResolvedValue(errorResponse(403));

    await expect(clearDebugModifiers("char-1")).rejects.toThrow("HTTP 403");
  });
});

// ─── listDebugModifiers ───────────────────────────────────────────────────────

describe("listDebugModifiers", () => {
  it("appelle le bon endpoint avec le characterId", async () => {
    mockFetch.mockResolvedValue(okJson({ modifiers: [] }));

    await listDebugModifiers("char-99");

    const [url] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/player-runtime/debug/modifiers/char-99");
  });

  it("envoie le header Authorization", async () => {
    mockFetch.mockResolvedValue(okJson({ modifiers: [] }));

    await listDebugModifiers("char-1");

    const [, options] = mockFetch.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer test-token");
  });

  it("retourne la liste des modifiers (data.modifiers)", async () => {
    const mods = [makeModifier({ id: "debug:char-1:1" }), makeModifier({ id: "debug:char-1:2", value: 5 })];
    mockFetch.mockResolvedValue(okJson({ modifiers: mods }));

    const result = await listDebugModifiers("char-1");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("debug:char-1:1");
    expect(result[1].value).toBe(5);
  });

  it("retourne [] si aucun modifier", async () => {
    mockFetch.mockResolvedValue(okJson({ modifiers: [] }));

    const result = await listDebugModifiers("char-1");

    expect(result).toEqual([]);
  });

  it("lève une erreur sur réponse non-ok", async () => {
    mockFetch.mockResolvedValue(errorResponse(403));

    await expect(listDebugModifiers("char-1")).rejects.toThrow("HTTP 403");
  });
});
