// apps/client/src/store/items.store.ts
import { create } from "zustand";
import type { Item, ItemSlot } from "../types/item.types";

interface ItemsState {
  inventory: Item[];
  equipment: Partial<Record<ItemSlot, Item>>;

  addToInventory: (item: Item) => void;
  equipItem: (item: Item) => void;
  unequipItem: (slot: ItemSlot) => void;
}

export const useItemsStore = create<ItemsState>((set) => ({
  inventory: [],
  equipment: {},

  addToInventory: (item) =>
    set((s) => ({ inventory: [...s.inventory, item] })),

  equipItem: (item) =>
    set((s) => ({
      equipment: { ...s.equipment, [item.slot]: item },
      inventory: s.inventory.filter((i) => i.id !== item.id),
    })),

  unequipItem: (slot) =>
    set((s) => {
      const item = s.equipment[slot];
      if (!item) return s;

      return {
        equipment: { ...s.equipment, [slot]: undefined },
        inventory: [...s.inventory, item],
      };
    }),
}));
