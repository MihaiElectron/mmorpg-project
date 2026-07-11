import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDerivedStatDefinition,
  fetchDerivedStatReferences,
  removeDerivedStatMasteryReference,
} from "./derivedStatsApi";

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function errJson(status: number, message: unknown): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ message }),
  } as unknown as Response;
}

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

describe("derivedStatsApi — maintenance (V3)", () => {
  it("GET /admin/derived-stat-definitions/:key/references", async () => {
    const report = {
      key: "luck",
      isSystem: false,
      canDelete: true,
      references: { masteryEffects: [] },
      counts: { masteryEffects: 0 },
    };
    mockFetch.mockResolvedValue(okJson(report));

    await expect(fetchDerivedStatReferences("luck")).resolves.toEqual(report);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/admin/derived-stat-definitions/luck/references");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("DELETE /admin/derived-stat-definitions/:key", async () => {
    mockFetch.mockResolvedValue(okJson({ deleted: true, key: "luck" }));

    await expect(deleteDerivedStatDefinition("luck")).resolves.toEqual({
      deleted: true,
      key: "luck",
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/admin/derived-stat-definitions/luck");
    expect(init?.method).toBe("DELETE");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("POST /remove-mastery-reference avec le body exact", async () => {
    mockFetch.mockResolvedValue(okJson({ key: "two_handed", effects: {} }));

    await removeDerivedStatMasteryReference("physicalAttack", {
      masteryKey: "two_handed",
      modifierIndex: 0,
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain(
      "/admin/derived-stat-definitions/physicalAttack/remove-mastery-reference",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      masteryKey: "two_handed",
      modifierIndex: 0,
    });
  });

  it("remonte le message serveur en erreur (stat système non supprimable)", async () => {
    mockFetch.mockResolvedValue(errJson(400, "Stat système non supprimable."));

    await expect(deleteDerivedStatDefinition("maxHealth")).rejects.toThrow(
      /non supprimable/,
    );
  });
});
