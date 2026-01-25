/**
 * character.store.js
 */
import { create } from "zustand";

const storeLogic = (set, get) => ({
  character: null,
  isOpen: false,
  inventory: [],
  equipment: {},

  setCharacter: (data) => set({ character: data }),
  clearCharacter: () => set({ character: null, inventory: [], equipment: {} }),
  toggleOpen: () => {
    console.log("🏪 [CharacterStore] toggleOpen");
    set((s) => ({ isOpen: !s.isOpen }));
  },

  updateInventoryItem: (itemData) => {
    console.log("🏪 [CharacterStore] updateInventoryItem:", itemData);
    set((state) => {
      const inventory = [...(state.inventory || [])];
      const index = inventory.findIndex((inv) => inv.item?.id === itemData.id);

      if (index > -1) {
        inventory[index] = { ...inventory[index], quantity: itemData.quantity };
      } else {
        inventory.push({
          id: `inv-${itemData.id}-${Date.now()}`,
          quantity: itemData.quantity,
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
      const res = await fetch("http://localhost:3000/characters/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Character not found");
      const data = await res.json();
      const equipmentMap = {};
      data.equipment?.forEach((eq) => {
        if (eq.slot && eq.item) equipmentMap[eq.slot] = eq.item;
      });
      const inventory = (data.inventory || [])
        .filter((inv) => !inv.equipped)
        .map((inv) => ({
          id: inv.id,
          quantity: inv.quantity,
          equipped: inv.equipped,
          item: inv.item,
        }));
      set({ character: data, equipment: equipmentMap, inventory });
    } catch (err) {
      console.error("❌ [CharacterStore] loadCharacter error:", err);
    }
  },

  equipItem: async (inventoryIdOrItemId) => {
    try {
      const token = localStorage.getItem("token");
      const character = get().character;
      if (!token || !character) return;
      const invEntry = get().inventory.find(i => i.id === inventoryIdOrItemId || i.item?.id === inventoryIdOrItemId);
      if (!invEntry) return;
      const res = await fetch(`http://localhost:3000/characters/${character.id}/equip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemId: invEntry.item.id }),
      });
      if (res.ok) await get().loadCharacter();
    } catch (err) {
      console.error("❌ [CharacterStore] equipItem error:", err);
    }
  },

  unequipItem: async (slot) => {
    try {
      const token = localStorage.getItem("token");
      const character = get().character;
      if (!token || !character) return;
      const res = await fetch(`http://localhost:3000/characters/${character.id}/unequip`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ slot }),
      });
      if (res.ok) await get().loadCharacter();
    } catch (err) {
      console.error("❌ [CharacterStore] unequipItem error:", err);
    }
  },
});

// Singleton Pattern pour synchronisation parfaite Phaser/React
const getStore = () => {
  const KEY = "__GLOBAL_CHARACTER_STORE__";
  if (typeof window !== "undefined") {
    if (!window[KEY]) {
      window[KEY] = create(storeLogic);
      console.log("📦 [CharacterStore] Global Singleton Initialized");
    }
    return window[KEY];
  }
  return create(storeLogic);
};

export const useCharacterStore = (selector) => getStore()(selector);
export const getCharacterStore = () => getStore();
