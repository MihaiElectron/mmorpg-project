/**
 * character.store.js
 */
import { create } from "zustand";
import { getCombatLogStore } from "./combatLog.store";

/**
 * Retour d'erreur d'équipement dans le chat combat existant (préfixe
 * [Équipement]), sans window.alert ni popup navigateur. Serveur autoritaire :
 * on n'affiche que le message renvoyé.
 */
function logEquipment(message) {
  if (!message) return;
  getCombatLogStore().getState().pushLog({
    category: "combat",
    message: `[Équipement] ${message}`,
    severity: "warn",
  });
}

const storeLogic = (set, get) => ({
  character: null,
  isOpen: false,
  inventory: [],
  equipment: {},
  masteries: [],
  balance: null,
  dragEquipSource: null,

  // Aperçu des stats dérivées pendant la répartition de points (Progression V1).
  // Jamais persisté : rempli par le serveur via /characters/me/stats-preview,
  // vidé à la validation/annulation. `_statPreviewSeq` ignore les réponses
  // obsolètes quand plusieurs requêtes sont en vol (debounce côté StatsTab).
  statPreviewDerived: null,
  statPreviewLoading: false,
  _statPreviewSeq: 0,

  clearStatPreview: () => set({ statPreviewDerived: null, statPreviewLoading: false }),

  requestStatPreview: async (draftPrimaryStats) => {
    const seq = get()._statPreviewSeq + 1;
    set({ _statPreviewSeq: seq, statPreviewLoading: true });
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/characters/me/stats-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ draftPrimaryStats }),
      });
      // Réponse obsolète : une requête plus récente a été lancée entre-temps.
      if (get()._statPreviewSeq !== seq) return;
      if (!res.ok) {
        // Erreur discrète : on garde les stats actuelles (pas de preview).
        set({ statPreviewDerived: null, statPreviewLoading: false });
        return;
      }
      const data = await res.json();
      if (get()._statPreviewSeq !== seq) return;
      set({ statPreviewDerived: data?.derived ?? null, statPreviewLoading: false });
    } catch {
      if (get()._statPreviewSeq !== seq) return;
      set({ statPreviewDerived: null, statPreviewLoading: false });
    }
  },

  setCharacter: (data) => set({ character: data }),
  setHealth: (health) =>
    set((s) => s.character ? { character: { ...s.character, health } } : {}),

  // Sync live des ressources courantes (Skills V1-J-C) suite à
  // `character_resource_update`. Serveur autoritaire : on applique les valeurs
  // reçues sans jamais recalculer. Les max (maxHealth/maxMana/maxEnergy) sont
  // des stats DÉRIVÉES serveur : s'ils sont fournis, on les intègre dans
  // `character.stats.derived` (jamais inventés côté client). Mise à jour
  // immuable pour déclencher le re-render React.
  setResources: ({ health, mana, energy, maxHealth, maxMana, maxEnergy } = {}) =>
    set((s) => {
      if (!s.character) return {};
      const nextCharacter = { ...s.character };
      if (health !== undefined) nextCharacter.health = health;
      if (mana !== undefined) nextCharacter.mana = mana;
      if (energy !== undefined) nextCharacter.energy = energy;

      // Intègre les max dérivés reçus uniquement si la structure existe déjà —
      // on n'invente pas `stats.derived` à partir de rien.
      const hasMax =
        maxHealth !== undefined || maxMana !== undefined || maxEnergy !== undefined;
      if (hasMax && s.character.stats?.derived) {
        nextCharacter.stats = {
          ...s.character.stats,
          derived: {
            ...s.character.stats.derived,
            ...(maxHealth !== undefined ? { maxHealth } : {}),
            ...(maxMana !== undefined ? { maxMana } : {}),
            ...(maxEnergy !== undefined ? { maxEnergy } : {}),
          },
        };
      }
      return { character: nextCharacter };
    }),
  clearCharacter: () => set({ character: null, inventory: [], equipment: {}, masteries: [], balance: null, dragEquipSource: null }),
  setDragEquipSource: (source) => set({ dragEquipSource: source }),
  clearDragEquipSource: () => set({ dragEquipSource: null }),
  toggleOpen: () => {
    set((s) => ({ isOpen: !s.isOpen }));
  },
  closePanel: () => set({ isOpen: false }),

  updateInventoryItem: (itemData) => {
    set((state) => {
      const inventory = [...(state.inventory || [])];
      const index = inventory.findIndex((inv) => inv.item?.id === itemData.id);
      const nextQuantity = Number(itemData.quantity ?? 0);

      if (index > -1) {
        if (nextQuantity <= 0) {
          inventory.splice(index, 1);
        } else {
          inventory[index] = { ...inventory[index], quantity: nextQuantity };
        }
      } else {
        if (nextQuantity <= 0) return { inventory };
        inventory.push({
          id: `inv-${itemData.id}-${Date.now()}`,
          quantity: nextQuantity,
          equipped: false,
          item: { 
            id: itemData.id, 
            name: itemData.name || itemData.id, 
            image: itemData.image 
          },
        });
      }
      return { inventory };
    });
  },

  loadCharacter: async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      // no-store : évite qu'un rechargement (ex: après édition d'item dans le
      // Studio, qui ne change pas le personnage) serve une réponse mise en cache
      // par le navigateur (ETag/304) → stats/tooltips restés obsolètes.
      const res = await fetch(`${import.meta.env.VITE_API_URL}/characters/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        const error = new Error("Character not found");
        error.status = res.status;
        set({ character: null, equipment: {}, inventory: [] });
        throw error;
      }
      const data = await res.json();
      const equipmentMap = {};
      data.equipment?.forEach((eq) => {
        if (eq.slot && eq.item) equipmentMap[eq.slot] = { ...eq.item, instanceId: eq.itemInstanceId ?? null };
      });
      const inventory = (data.inventory || [])
        .filter((inv) => !inv.equipped)
        .map((inv) => ({
          id: inv.id,
          instanceId: inv.instanceId ?? null,
          quantity: inv.quantity,
          equipped: inv.equipped,
          slotIndex: inv.slotIndex ?? null,
          item: inv.item,
        }));
      set({ character: data, equipment: equipmentMap, inventory });
      return data;
    } catch (err) {
      console.error("[CharacterStore] loadCharacter error:", err);
      throw err;
    }
  },

  applyCharacterXpUpdate: ({ level, experience, nextLevelXp }) => {
    set((s) => s.character ? { character: { ...s.character, level, experience, nextLevelXp } } : {});
  },

  updateMastery: (masteryData) => {
    const resolvedKey = masteryData.key || masteryData.masteryDefinitionKey;
    if (!resolvedKey) return;
    const normalized = { ...masteryData, key: resolvedKey };
    set((state) => {
      const masteries = [...(state.masteries || [])];
      const index = masteries.findIndex((s) => s.key === resolvedKey);
      if (index > -1) {
        masteries[index] = { ...masteries[index], ...normalized };
      } else {
        if (!normalized.name || !normalized.category) return { masteries };
        masteries.push(normalized);
      }
      return { masteries };
    });
  },

  allocateStats: async (payload) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return { ok: false, error: "Non authentifié" };
      const res = await fetch(`${import.meta.env.VITE_API_URL}/characters/me/stats/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = `Allocation impossible (HTTP ${res.status})`;
        try { const body = await res.json(); if (body?.message) msg = Array.isArray(body.message) ? body.message.join(", ") : body.message; } catch { /* ignore */ }
        return { ok: false, error: msg };
      }
      // Réponse serveur = même format que GET /characters/me (serveur autoritaire).
      const data = await res.json();
      set({ character: data });
      return { ok: true };
    } catch (err) {
      console.error("[CharacterStore] allocateStats error:", err);
      return { ok: false, error: "Erreur réseau" };
    }
  },

  loadBalance: async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/economy/me/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      set({ balance: data });
    } catch {
      // balance non critique, on ignore silencieusement
    }
  },

  loadMasteries: async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/characters/me/masteries`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      set({ masteries: data });
    } catch (err) {
      console.error("[CharacterStore] loadMasteries error:", err);
    }
  },

  // Persiste l'ordre visuel de l'inventaire (slotIndex) côté serveur. Le serveur
  // reste la source de vérité : on resynchronise depuis la projection fraîche
  // retournée. En cas d'erreur, on recharge /characters/me pour restaurer.
  saveInventorySlots: async (entries) => {
    try {
      const token = localStorage.getItem("token");
      const character = get().character;
      if (!token || !character || !Array.isArray(entries) || entries.length === 0) return { ok: false };
      const res = await fetch(`${import.meta.env.VITE_API_URL}/inventory/${character.id}/slots`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entries }),
      });
      if (!res.ok) {
        await get().loadCharacter();
        return { ok: false };
      }
      const projection = await res.json();
      const inventory = (projection || [])
        .filter((inv) => !inv.equipped)
        .map((inv) => ({
          id: inv.id,
          instanceId: inv.instanceId ?? null,
          quantity: inv.quantity,
          equipped: inv.equipped,
          slotIndex: inv.slotIndex ?? null,
          item: inv.item,
        }));
      set({ inventory });
      return { ok: true };
    } catch (err) {
      console.error("[CharacterStore] saveInventorySlots error:", err);
      await get().loadCharacter();
      return { ok: false };
    }
  },

  equipItem: async (inventoryIdOrItemId) => {
    try {
      const token = localStorage.getItem("token");
      const character = get().character;
      if (!token || !character) return;
      const invEntry = get().inventory.find(i => i.id === inventoryIdOrItemId || i.item?.id === inventoryIdOrItemId);
      if (!invEntry) return;
      // Garde : un item INSTANCE doit toujours porter un instanceId. S'il manque,
      // c'est une projection/donnée invalide. On refuse le chemin legacy (par itemId)
      // qui corromprait l'état (CharacterEquipment sans itemInstanceId).
      if (invEntry.item?.objectMode === "INSTANCE" && !invEntry.instanceId) {
        const msg = "InstanceId manquant — projection invalide";
        console.error("[CharacterStore] equipItem:", msg, invEntry);
        logEquipment(msg);
        return;
      }
      let res;
      if (invEntry.instanceId) {
        res = await fetch(
          `${import.meta.env.VITE_API_URL}/inventory/${character.id}/equip-instance/${invEntry.instanceId}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        res = await fetch(`${import.meta.env.VITE_API_URL}/characters/${character.id}/equip`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ itemId: invEntry.item.id }),
        });
      }
      if (res.ok) {
        await get().loadCharacter();
      } else {
        let msg = `Équipement impossible (HTTP ${res.status})`;
        try { const body = await res.json(); if (body?.message) msg = body.message; } catch { /* ignore */ }
        console.error("[CharacterStore] equipItem failed:", msg);
        logEquipment(msg);
      }
    } catch (err) {
      console.error("[CharacterStore] equipItem error:", err);
    }
  },

  unequipItem: async (slot) => {
    try {
      const token = localStorage.getItem("token");
      const character = get().character;
      if (!token || !character) return { ok: false };
      const res = await fetch(`${import.meta.env.VITE_API_URL}/inventory/${character.id}/unequip/${encodeURIComponent(slot)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await get().loadCharacter();
        return { ok: true };
      }
      let msg = `Déséquipement impossible (HTTP ${res.status})`;
      try { const body = await res.json(); if (body?.message) msg = body.message; } catch { /* ignore */ }
      console.error("[CharacterStore] unequipItem failed:", msg);
      logEquipment(msg);
      return { ok: false };
    } catch (err) {
      console.error("[CharacterStore] unequipItem error:", err);
      return { ok: false };
    }
  },
});

// Singleton Pattern pour synchronisation parfaite Phaser/React
const getStore = () => {
  const KEY = "__GLOBAL_CHARACTER_STORE__";
  if (typeof window !== "undefined") {
    if (!window[KEY]) {
      window[KEY] = create(storeLogic);
    }
    return window[KEY];
  }
  return create(storeLogic);
};

export const useCharacterStore = (selector) => getStore()(selector);
export const getCharacterStore = () => getStore();
