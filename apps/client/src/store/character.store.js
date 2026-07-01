/**
 * character.store.js
 */
import { create } from "zustand";

const storeLogic = (set, get) => ({
  character: null,
  isOpen: false,
  inventory: [],
  equipment: {},
  skills: [],
  balance: null,
  dragEquipSource: null,

  setCharacter: (data) => set({ character: data }),
  setHealth: (health) =>
    set((s) => s.character ? { character: { ...s.character, health } } : {}),
  clearCharacter: () => set({ character: null, inventory: [], equipment: {}, skills: [], balance: null, dragEquipSource: null }),
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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/characters/me`, {
        headers: { Authorization: `Bearer ${token}` },
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
          item: inv.item,
        }));
      set({ character: data, equipment: equipmentMap, inventory });
      return data;
    } catch (err) {
      console.error("[CharacterStore] loadCharacter error:", err);
      throw err;
    }
  },

  updateSkill: (skillData) => {
    set((state) => {
      const skills = [...(state.skills || [])];
      const index = skills.findIndex((s) => s.key === skillData.key);
      if (index > -1) {
        skills[index] = { ...skills[index], ...skillData };
      } else {
        skills.push(skillData);
      }
      return { skills };
    });
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

  loadSkills: async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/characters/me/skills`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      set({ skills: data });
    } catch (err) {
      console.error("[CharacterStore] loadSkills error:", err);
    }
  },

  equipItem: async (inventoryIdOrItemId) => {
    try {
      const token = localStorage.getItem("token");
      const character = get().character;
      if (!token || !character) return;
      const invEntry = get().inventory.find(i => i.id === inventoryIdOrItemId || i.item?.id === inventoryIdOrItemId);
      if (!invEntry) return;
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
        alert(msg);
      }
    } catch (err) {
      console.error("[CharacterStore] equipItem error:", err);
    }
  },

  unequipItem: async (slot) => {
    try {
      const token = localStorage.getItem("token");
      const character = get().character;
      if (!token || !character) return;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/inventory/${character.id}/unequip/${encodeURIComponent(slot)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) await get().loadCharacter();
    } catch (err) {
      console.error("[CharacterStore] unequipItem error:", err);
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
