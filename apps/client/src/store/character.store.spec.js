import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCharacterStore } from "./character.store";
import { getCombatLogStore } from "./combatLog.store";

const VITE_API_URL = "http://localhost:3000";

// En env "node", les stores sont des singletons sur `window` : sans window,
// chaque getXStore() crée une instance distincte (le log d'équipement du store
// ne serait pas visible ici). On fournit un window stable partagé.
vi.stubGlobal("window", globalThis);
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
// updateMastery — logique de normalisation et garde défensive
// ---------------------------------------------------------------------------

function makeUpdateMastery() {
  let masteries = [];
  const set = (fn) => { masteries = fn({ masteries }).masteries ?? masteries; };
  const getState = () => ({ masteries });

  const updateMastery = (masteryData) => {
    const resolvedKey = masteryData.key || masteryData.masteryDefinitionKey;
    if (!resolvedKey) return;
    const normalized = { ...masteryData, key: resolvedKey };
    set((state) => {
      const list = [...(state.masteries || [])];
      const index = list.findIndex((s) => s.key === resolvedKey);
      if (index > -1) {
        list[index] = { ...list[index], ...normalized };
      } else {
        if (!normalized.name || !normalized.category) return { masteries: list };
        list.push(normalized);
      }
      return { masteries: list };
    });
  };

  return { updateMastery, getState, setMasteries: (s) => { masteries = s; } };
}

describe("character.store — updateMastery", () => {
  it("met a jour un mastery existant via key", () => {
    const { updateMastery, getState, setMasteries } = makeUpdateMastery();
    setMasteries([{ key: "two_handed", name: "Two-Handed", category: "combat", level: 1, xp: 0, enabled: true }]);

    updateMastery({ key: "two_handed", level: 2, xp: 10, nextLevelXp: 200, leveledUp: true });

    expect(getState().masteries[0].level).toBe(2);
    expect(getState().masteries[0].xp).toBe(10);
    expect(getState().masteries[0].name).toBe("Two-Handed");
  });

  it("normalise masteryDefinitionKey vers key pour trouver le mastery existant", () => {
    const { updateMastery, getState, setMasteries } = makeUpdateMastery();
    setMasteries([{ key: "bow", name: "Bow", category: "combat", level: 1, xp: 0, enabled: true }]);

    updateMastery({ masteryDefinitionKey: "bow", level: 3, xp: 25, nextLevelXp: 150, leveledUp: false });

    expect(getState().masteries[0].level).toBe(3);
    expect(getState().masteries[0].key).toBe("bow");
  });

  it("ajoute un nouveau mastery si key absente des masteries charges et payload complet", () => {
    const { updateMastery, getState } = makeUpdateMastery();

    updateMastery({ masteryDefinitionKey: "crossbow", key: "crossbow", name: "Crossbow", category: "combat", level: 1, xp: 5, nextLevelXp: 100, enabled: true });

    expect(getState().masteries).toHaveLength(1);
    expect(getState().masteries[0].key).toBe("crossbow");
    expect(getState().masteries[0].category).toBe("combat");
  });

  it("ignore un payload sans resolvedKey", () => {
    const { updateMastery, getState } = makeUpdateMastery();

    updateMastery({ level: 1, xp: 5 });

    expect(getState().masteries).toHaveLength(0);
  });

  it("n'ajoute pas un nouveau mastery si name ou category manquent (payload incomplet)", () => {
    const { updateMastery, getState } = makeUpdateMastery();

    updateMastery({ masteryDefinitionKey: "two_handed", level: 1, xp: 5, nextLevelXp: 100 });

    expect(getState().masteries).toHaveLength(0);
  });

  it("met a jour sans ecraser name/category si deja present dans le store", () => {
    const { updateMastery, getState, setMasteries } = makeUpdateMastery();
    setMasteries([{ key: "mining", name: "Mining", category: "gathering", level: 1, xp: 0, enabled: true }]);

    updateMastery({ masteryDefinitionKey: "mining", level: 2, xp: 40 });

    expect(getState().masteries[0].name).toBe("Mining");
    expect(getState().masteries[0].category).toBe("gathering");
    expect(getState().masteries[0].level).toBe(2);
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

  it("refuse le legacy et logue dans le chat combat si item INSTANCE sans instanceId", async () => {
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
    getCombatLogStore().getState().clearLogs();

    await store.getState().equipItem("inv-legacy");

    expect(fetchMock).not.toHaveBeenCalled();
    // Plus de window.alert : message routé dans le chat combat, préfixe [Équipement].
    const entries = getCombatLogStore().getState().entries;
    expect(entries.at(-1)?.message).toBe("[Équipement] InstanceId manquant — projection invalide");
    expect(entries.at(-1)?.severity).toBe("warn");
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

describe("character.store — setResources (Skills V1-J-C)", () => {
  let store;

  beforeEach(() => {
    store = getCharacterStore();
    store.setState({
      character: {
        id: "char-1",
        health: 80,
        mana: 30,
        energy: 10,
        maxHealth: 100,
        stats: { derived: { maxHealth: 100, maxMana: 50, maxEnergy: 40 } },
      },
    });
  });

  it("met à jour health/mana/energy de façon immuable", () => {
    const before = store.getState().character;
    store.getState().setResources({ health: 80, mana: 20, energy: 8 });
    const after = store.getState().character;
    expect(after.mana).toBe(20);
    expect(after.energy).toBe(8);
    expect(after.health).toBe(80);
    expect(after).not.toBe(before); // nouvelle référence → re-render
  });

  it("intègre les max reçus dans stats.derived sans écraser le reste", () => {
    store.setState({
      character: {
        id: "char-1",
        health: 50,
        mana: 10,
        energy: 5,
        stats: { derived: { maxHealth: 100, maxMana: 50, maxEnergy: 40, physicalAttack: 13 } },
      },
    });
    store.getState().setResources({ health: 50, mana: 10, energy: 5, maxMana: 60, maxEnergy: 44 });
    const d = store.getState().character.stats.derived;
    expect(d.maxMana).toBe(60);
    expect(d.maxEnergy).toBe(44);
    expect(d.maxHealth).toBe(100); // inchangé
    expect(d.physicalAttack).toBe(13); // préservé
  });

  it("n'invente pas stats.derived s'il n'existe pas", () => {
    store.setState({ character: { id: "char-1", health: 50, mana: 10, energy: 5 } });
    store.getState().setResources({ mana: 8, maxMana: 60 });
    const c = store.getState().character;
    expect(c.mana).toBe(8);
    expect(c.stats).toBeUndefined();
  });

  it("ne fait rien sans personnage chargé", () => {
    store.setState({ character: null });
    store.getState().setResources({ mana: 5 });
    expect(store.getState().character).toBeNull();
  });

  it("ne touche qu'aux ressources fournies (undefined ignoré)", () => {
    store.getState().setResources({ mana: 25 });
    const c = store.getState().character;
    expect(c.mana).toBe(25);
    expect(c.health).toBe(80); // inchangé
    expect(c.energy).toBe(10); // inchangé
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
