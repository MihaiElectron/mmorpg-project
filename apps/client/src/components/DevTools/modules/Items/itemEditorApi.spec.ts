import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createItem } from "./itemEditorApi";

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
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

describe("itemEditorApi", () => {
  it("crée un item via POST /item", async () => {
    const created = {
      id: "item-new",
      name: "Bois",
      type: "material",
      category: "wood",
      image: "",
    };
    mockFetch.mockResolvedValue(okJson(created));

    await expect(createItem({
      name: "Bois",
      type: "material",
      category: "wood",
      image: "",
    })).resolves.toEqual(created);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toContain("/item");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });
    expect(init?.body).toBe(JSON.stringify({
      name: "Bois",
      type: "material",
      category: "wood",
      image: "",
    }));
  });
});
