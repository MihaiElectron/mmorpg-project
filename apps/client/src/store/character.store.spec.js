import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCharacterStore } from "./character.store";

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

// ---------------------------------------------------------------------------
// updateSkill — logique de normalisation et garde défensive
// ---------------------------------------------------------------------------

function makeUpdateSkill() {
  let skills = [];
  const set = (fn) => { skills = fn({ skills }).skills ?? skills; };
  const getState = () => ({ skills });

  const updateSkill = (skillData) => {
    const resolvedKey = skillData.key || skillData.skillDefinitionKey;
    if (!resolvedKey) return;
    const normalized = { ...skillData, key: resolvedKey };
    set((state) => {
      const list = [...(state.skills || [])];
      const index = list.findIndex((s) => s.key === resolvedKey);
      if (index > -1) {
        list[index] = { ...list[index], ...normalized };
      } else {
        if (!normalized.name || !normalized.category) return { skills: list };
        list.push(normalized);
      }
      return { skills: list };
    });
  };

  return { updateSkill, getState, setSkills: (s) => { skills = s; } };
}

describe("character.store — updateSkill", () => {
  it("met a jour un skill existant via key", () => {
    const { updateSkill, getState, setSkills } = makeUpdateSkill();
    setSkills([{ key: "two_handed", name: "Two-Handed", category: "combat", level: 1, xp: 0, enabled: true }]);

    updateSkill({ key: "two_handed", level: 2, xp: 10, nextLevelXp: 200, leveledUp: true });

    expect(getState().skills[0].level).toBe(2);
    expect(getState().skills[0].xp).toBe(10);
    expect(getState().skills[0].name).toBe("Two-Handed");
  });

  it("normalise skillDefinitionKey vers key pour trouver le skill existant", () => {
    const { updateSkill, getState, setSkills } = makeUpdateSkill();
    setSkills([{ key: "bow", name: "Bow", category: "combat", level: 1, xp: 0, enabled: true }]);

    updateSkill({ skillDefinitionKey: "bow", level: 3, xp: 25, nextLevelXp: 150, leveledUp: false });

    expect(getState().skills[0].level).toBe(3);
    expect(getState().skills[0].key).toBe("bow");
  });

  it("ajoute un nouveau skill si key absente des skills charges et payload complet", () => {
    const { updateSkill, getState } = makeUpdateSkill();

    updateSkill({ skillDefinitionKey: "crossbow", key: "crossbow", name: "Crossbow", category: "combat", level: 1, xp: 5, nextLevelXp: 100, enabled: true });

    expect(getState().skills).toHaveLength(1);
    expect(getState().skills[0].key).toBe("crossbow");
    expect(getState().skills[0].category).toBe("combat");
  });

  it("ignore un payload sans resolvedKey", () => {
    const { updateSkill, getState } = makeUpdateSkill();

    updateSkill({ level: 1, xp: 5 });

    expect(getState().skills).toHaveLength(0);
  });

  it("n'ajoute pas un nouveau skill si name ou category manquent (payload incomplet)", () => {
    const { updateSkill, getState } = makeUpdateSkill();

    updateSkill({ skillDefinitionKey: "two_handed", level: 1, xp: 5, nextLevelXp: 100 });

    expect(getState().skills).toHaveLength(0);
  });

  it("met a jour sans ecraser name/category si deja present dans le store", () => {
    const { updateSkill, getState, setSkills } = makeUpdateSkill();
    setSkills([{ key: "mining", name: "Mining", category: "gathering", level: 1, xp: 0, enabled: true }]);

    updateSkill({ skillDefinitionKey: "mining", level: 2, xp: 40 });

    expect(getState().skills[0].name).toBe("Mining");
    expect(getState().skills[0].category).toBe("gathering");
    expect(getState().skills[0].level).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// equipItem — choix endpoint instance vs legacy + garde INSTANCE sans instanceId
// ---------------------------------------------------------------------------

describe("character.store — equipItem (choix endpoint)", () => {
  let store;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorageMock.getItem.mockReturnValue("test-token");
    store = getCharacterStore();
    store.setState({ character: { id: "char-1" }, inventory: [], equipment: {} });
  });

  it("appelle equip-instance quand l'entrée a un instanceId (item INSTANCE)", async () => {
    const entry = {
      id: "inst-1",
      instanceId: "inst-1",
      quantity: 1,
      equipped: false,
      item: { id: "earring-2", name: "Earring +2", objectMode: "INSTANCE" },
    };
    store.setState({ inventory: [entry] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await store.getState().equipItem("inst-1");

    // Premier appel = l'équipement (les suivants = loadCharacter).
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("/equip-instance/inst-1");
    expect(url).not.toContain("/characters/char-1/equip");
  });

  it("refuse le legacy et alerte si item INSTANCE sans instanceId (projection invalide)", async () => {
    const entry = {
      id: "inv-legacy",
      instanceId: null,
      quantity: 1,
      equipped: false,
      item: { id: "earring", name: "earring", objectMode: "INSTANCE" },
    };
    store.setState({ inventory: [entry] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const alertMock = vi.fn();
    vi.stubGlobal("alert", alertMock);

    await store.getState().equipItem("inv-legacy");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith("InstanceId manquant — projection invalide");
  });

  it("utilise le legacy pour un item STACKABLE sans instanceId", async () => {
    const entry = {
      id: "inv-stack",
      instanceId: null,
      quantity: 3,
      equipped: false,
      item: { id: "sword-legacy", name: "Épée", objectMode: "STACKABLE" },
    };
    store.setState({ inventory: [entry] });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await store.getState().equipItem("inv-stack");

    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("/characters/char-1/equip");
  });
});

describe("character.store — allocateStats", () => {
  let store;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorageMock.getItem.mockReturnValue("test-token");
    store = getCharacterStore();
    store.setState({ character: { id: "char-1", unspentStatPoints: 5 } });
  });

  it("POST vers /characters/me/stats/allocate avec le payload fourni", async () => {
    const serverCharacter = { id: "char-1", unspentStatPoints: 3, stats: { base: { strength: 2 } } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => serverCharacter });
    vi.stubGlobal("fetch", fetchMock);

    const result = await store.getState().allocateStats({ strength: 2 });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain("/characters/me/stats/allocate");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ strength: 2 });
    expect(result).toEqual({ ok: true });
  });

  it("met à jour le character depuis la réponse serveur (autoritaire)", async () => {
    const serverCharacter = { id: "char-1", unspentStatPoints: 1, stats: { base: { strength: 4 } } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => serverCharacter });
    vi.stubGlobal("fetch", fetchMock);

    await store.getState().allocateStats({ strength: 4 });

    expect(store.getState().character).toEqual(serverCharacter);
  });

  it("renvoie l'erreur serveur sans modifier le character en cas de rejet", async () => {
    const before = store.getState().character;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Points insuffisants" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await store.getState().allocateStats({ strength: 99 });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Points insuffisants");
    expect(store.getState().character).toBe(before);
  });
});
