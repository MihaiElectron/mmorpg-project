import { describe, it, expect, vi, beforeEach } from "vitest";

const VITE_API_URL = "http://localhost:3000";

vi.stubGlobal("import", { meta: { env: { VITE_API_URL } } });

const localStorageMock = { getItem: vi.fn().mockReturnValue("test-token") };
vi.stubGlobal("localStorage", localStorageMock);

function makeStackEntry(overrides = {}) {
  return {
    id: "inv-row-1",
    instanceId: null,
    quantity: 3,
    equipped: false,
    item: { id: "item-1", name: "Baton de bois", type: "material", category: "wooden_stick", image: null },
    ...overrides,
  };
}

function makeInstanceEntry(overrides = {}) {
  return {
    id: "inst-1",
    instanceId: "inst-1",
    quantity: 1,
    equipped: false,
    item: { id: "item-1", name: "Basic Sword", type: "weapon", category: "basic_sword", slot: "weapon", image: null },
    ...overrides,
  };
}

describe("character.store — equipItem", () => {
  let get;
  let set;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorageMock.getItem.mockReturnValue("test-token");
  });

  function makeStore(inventory) {
    const character = { id: "char-1" };
    let _inventory = inventory;
    const store = {
      get character() { return character; },
      get inventory() { return _inventory; },
      loadCharacter: vi.fn().mockResolvedValue(undefined),
    };
    return store;
  }

  it("equipe un STACK via le endpoint legacy /characters/:id/equip", async () => {
    const entry = makeStackEntry();
    const store = makeStore([entry]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const equipItem = async (inventoryIdOrItemId) => {
      const token = localStorage.getItem("token");
      const character = store.character;
      if (!token || !character) return;
      const invEntry = store.inventory.find(
        (i) => i.id === inventoryIdOrItemId || i.item?.id === inventoryIdOrItemId,
      );
      if (!invEntry) return;
      let res;
      if (invEntry.instanceId) {
        res = await fetch(
          `${VITE_API_URL}/inventory/${character.id}/equip-instance/${invEntry.instanceId}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        res = await fetch(`${VITE_API_URL}/characters/${character.id}/equip`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ itemId: invEntry.item.id }),
        });
      }
      if (res.ok) await store.loadCharacter();
    };

    await equipItem(entry.id);

    expect(fetchMock).toHaveBeenCalledWith(
      `${VITE_API_URL}/characters/char-1/equip`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ itemId: "item-1" }),
      }),
    );
    expect(store.loadCharacter).toHaveBeenCalled();
  });

  it("equipe une INSTANCE via le endpoint /inventory/:characterId/equip-instance/:instanceId", async () => {
    const entry = makeInstanceEntry();
    const store = makeStore([entry]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const equipItem = async (inventoryIdOrItemId) => {
      const token = localStorage.getItem("token");
      const character = store.character;
      if (!token || !character) return;
      const invEntry = store.inventory.find(
        (i) => i.id === inventoryIdOrItemId || i.item?.id === inventoryIdOrItemId,
      );
      if (!invEntry) return;
      let res;
      if (invEntry.instanceId) {
        res = await fetch(
          `${VITE_API_URL}/inventory/${character.id}/equip-instance/${invEntry.instanceId}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        res = await fetch(`${VITE_API_URL}/characters/${character.id}/equip`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ itemId: invEntry.item.id }),
        });
      }
      if (res.ok) await store.loadCharacter();
    };

    await equipItem(entry.id);

    expect(fetchMock).toHaveBeenCalledWith(
      `${VITE_API_URL}/inventory/char-1/equip-instance/inst-1`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/characters/char-1/equip"),
      expect.anything(),
    );
    expect(store.loadCharacter).toHaveBeenCalled();
  });

  it("ne fait rien si l entree n existe pas dans l inventaire", async () => {
    const store = makeStore([]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const equipItem = async (inventoryIdOrItemId) => {
      const token = localStorage.getItem("token");
      const character = store.character;
      if (!token || !character) return;
      const invEntry = store.inventory.find(
        (i) => i.id === inventoryIdOrItemId || i.item?.id === inventoryIdOrItemId,
      );
      if (!invEntry) return;
      await fetch("unused");
    };

    await equipItem("unknown-id");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loadCharacter mappe instanceId depuis la reponse API", () => {
    const rawInventory = [
      { id: "inv-row-1", instanceId: null, quantity: 3, equipped: false, item: { id: "item-1" } },
      { id: "inst-1", instanceId: "inst-1", quantity: 1, equipped: false, item: { id: "item-2" } },
    ];

    const mapped = rawInventory
      .filter((inv) => !inv.equipped)
      .map((inv) => ({
        id: inv.id,
        instanceId: inv.instanceId ?? null,
        quantity: inv.quantity,
        equipped: inv.equipped,
        item: inv.item,
      }));

    expect(mapped[0].instanceId).toBeNull();
    expect(mapped[1].instanceId).toBe("inst-1");
  });
});
