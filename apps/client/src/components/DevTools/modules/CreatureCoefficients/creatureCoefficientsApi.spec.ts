import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCreatureSecondaryCoefficients,
  updateCreatureSecondaryCoefficients,
} from "./creatureCoefficientsApi";

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

function errJson(status: number, message: unknown): Response {
  return { ok: false, status, json: () => Promise.resolve({ message }) } as unknown as Response;
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

describe("creatureCoefficientsApi", () => {
  it("lit la config via GET /admin/creatures/secondary-coefficients", async () => {
    const body = { attackPowerPerStrength: 2, secondaryChanceCap: 40 };
    mockFetch.mockResolvedValue(okJson(body));

    await expect(fetchCreatureSecondaryCoefficients()).resolves.toEqual(body);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/admin/creatures/secondary-coefficients");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-token" });
  });

  it("applique un patch via PATCH et renvoie la config effective", async () => {
    const patch = { attackPowerPerStrength: 4 };
    const effective = { attackPowerPerStrength: 4, secondaryChanceCap: 40 };
    mockFetch.mockResolvedValue(okJson(effective));

    await expect(updateCreatureSecondaryCoefficients(patch)).resolves.toEqual(effective);

    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/admin/creatures/secondary-coefficients");
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual(patch);
  });

  it("remonte le message d'erreur serveur", async () => {
    mockFetch.mockResolvedValue(errJson(400, "attackPowerPerStrength must not be greater than 20"));
    await expect(fetchCreatureSecondaryCoefficients()).rejects.toThrow(
      "attackPowerPerStrength must not be greater than 20",
    );
  });
});
