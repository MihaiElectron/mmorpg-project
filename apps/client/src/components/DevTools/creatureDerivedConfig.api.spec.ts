import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchDerivedConfiguration,
  fetchRuntimeSnapshot,
  saveDerivedConfiguration,
} from "./creatureDerivedConfig.api";

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}
function errJson(status: number, message: unknown): Response {
  return { ok: false, status, json: () => Promise.resolve({ message }) } as unknown as Response;
}

const mockFetch = vi.fn();
const mockLocalStorage = { getItem: vi.fn().mockReturnValue("test-token") };

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("localStorage", mockLocalStorage);
  mockFetch.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("creatureDerivedConfig.api", () => {
  it("GET config : URL par clé + Bearer", async () => {
    mockFetch.mockResolvedValue(okJson({ templateKey: "turkey", derivedStats: [], scalarParams: [], catalog: {} }));
    await fetchDerivedConfiguration("turkey");
    const [url, opts] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/admin/creatures/templates/turkey/derived-configuration");
    expect((opts as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("PUT save : méthode PUT + payload sérialisé", async () => {
    mockFetch.mockResolvedValue(okJson({ templateKey: "turkey", derivedStats: [], scalarParams: [], catalog: {} }));
    const payload = {
      derivedOverrides: [{ derivedStatKey: "physicalAttack", coefficients: [{ primaryStatKey: "strength", coefficient: 3.5 }] }],
      scalarOverrides: [],
    };
    await saveDerivedConfiguration("turkey", payload);
    const [, opts] = mockFetch.mock.calls[0];
    expect((opts as RequestInit).method).toBe("PUT");
    expect(JSON.parse((opts as RequestInit).body as string)).toEqual(payload);
  });

  it("GET snapshot : URL instance", async () => {
    mockFetch.mockResolvedValue(okJson({ instanceId: "i1", traces: [] }));
    await fetchRuntimeSnapshot("i1");
    expect(String(mockFetch.mock.calls[0][0])).toContain("/admin/creatures/instances/i1/runtime-stats");
  });

  it("propage le message d'erreur serveur", async () => {
    mockFetch.mockResolvedValue(errJson(400, "clé invalide"));
    await expect(fetchDerivedConfiguration("turkey")).rejects.toThrow("clé invalide");
  });

  it("erreur sans message → Erreur <status>", async () => {
    mockFetch.mockResolvedValue(errJson(404, undefined));
    await expect(fetchRuntimeSnapshot("nope")).rejects.toThrow("Erreur 404");
  });
});
