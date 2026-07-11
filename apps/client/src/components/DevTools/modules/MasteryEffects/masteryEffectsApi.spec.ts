import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMasteryDefinition,
  fetchMasteryDefinitions,
  fetchMasteryEffectTargets,
  updateMasteryEffects,
} from "./masteryEffectsApi";

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

describe("masteryEffectsApi", () => {
  it("liste les targets via GET /admin/mastery-effect-targets", async () => {
    const body = { targets: [{ key: "physicalAttack" }], modes: [], contextualStats: ["physicalAttack"] };
    mockFetch.mockResolvedValue(okJson(body));

    await expect(fetchMasteryEffectTargets()).resolves.toEqual(body);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/admin/mastery-effect-targets");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("liste les définitions via GET /admin/mastery-definitions", async () => {
    const rows = [{ key: "two_handed", name: "Two-Handed", effects: {} }];
    mockFetch.mockResolvedValue(okJson(rows));

    await expect(fetchMasteryDefinitions()).resolves.toEqual(rows);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/admin/mastery-definitions");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("PATCH /admin/mastery-definitions/:key avec le body exact { effects }", async () => {
    mockFetch.mockResolvedValue(okJson({ key: "two_handed", effects: {} }));

    const effects = {
      context: { weaponType: "two_handed_sword" },
      combat: { damagePercentPerLevel: 5 },
    };
    await updateMasteryEffects("two_handed", effects);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/admin/mastery-definitions/two_handed");
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({ effects });
  });

  it("désactivation : body { effects: {} }", async () => {
    mockFetch.mockResolvedValue(okJson({ key: "two_handed", effects: {} }));

    await updateMasteryEffects("two_handed", {});

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ effects: {} });
  });

  it("POST /admin/mastery-definitions avec le body exact", async () => {
    const created = { key: "dagger", name: "Dague", category: "combat", effects: {} };
    mockFetch.mockResolvedValue(okJson(created));

    const payload = {
      key: "dagger",
      name: "Dague",
      category: "combat",
      maxLevel: 100,
      baseXpPerLevel: 100,
      xpCurveExponent: 1.5,
      enabled: true,
      effects: {},
    };
    await expect(createMasteryDefinition(payload)).resolves.toEqual(created);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/admin/mastery-definitions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual(payload);
  });

  it("remonte l'erreur serveur à la création (409 key dupliquée)", async () => {
    mockFetch.mockResolvedValue(errJson(409, 'Mastery "dagger" existe déjà.'));

    await expect(
      createMasteryDefinition({
        key: "dagger",
        name: "Dague",
        category: "combat",
        maxLevel: 100,
        baseXpPerLevel: 100,
        xpCurveExponent: 1.5,
        enabled: true,
        effects: {},
      }),
    ).rejects.toThrow(/existe déjà/);
  });

  it("remonte le message serveur en erreur 400 (sanitize)", async () => {
    mockFetch.mockResolvedValue(
      errJson(400, "effects.combat.stun n'est pas un effet supporté"),
    );

    await expect(updateMasteryEffects("two_handed", {})).rejects.toThrow(
      /pas un effet supporté/,
    );
  });
});
