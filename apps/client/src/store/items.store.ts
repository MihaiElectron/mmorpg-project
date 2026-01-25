/**
 * items.store.ts
 * -----------------------------------------------------------------------------
 * Store Zustand pour gérer l'inventaire et l'équipement d'un personnage.
 * - inventory : liste complète des items du joueur
 * - equipment : mapping slot → item équipé
 *
 * Actions :
 * - addToInventory(item) : ajoute un item à l’inventaire
 * - equipItem(item)      : équipe un item dans son slot et le retire de l’inventaire
 * - unequipItem(slot)    : déséquipe un item et le remet dans l’inventaire
 * -----------------------------------------------------------------------------
 */

import { create } from "zustand";
import type { Item, ItemSlot } from "../types/item.types";

interface ItemsState {
  inventory: { item: Item; quantity: number }[];
  equipment: Partial<Record<ItemSlot, Item>>;

  addToInventory: (item: Item) => void;
  equipItem: (item: Item) => void;
  unequipItem: (slot: ItemSlot) => void;
}

export const useItemsStore = create<ItemsState>((set) => ({
  inventory: [],
  equipment: {},

  // ---------------------------------------------------------------------------
  // Ajouter un item à l'inventaire
  // ---------------------------------------------------------------------------
  addToInventory: (item) =>
    set((s) => ({
      inventory: [...s.inventory, { item, quantity: 1 }],
    })),

  // ---------------------------------------------------------------------------
  // Équipe un item
  // - Le slot de l'item est déterminé par item.slot
  // - L'item est retiré de l'inventaire
  // ---------------------------------------------------------------------------
  equipItem: (item) =>
    set((s) => ({
      equipment: { ...s.equipment, [item.slot]: item },
      inventory: s.inventory.filter((i) => i.item.id !== item.id),
    })),

  // ---------------------------------------------------------------------------
  // Déséquipe un item
  // - L'item est retiré du slot et remis dans l'inventaire
  // ---------------------------------------------------------------------------
  unequipItem: (slot) =>
    set((s) => {
      const item = s.equipment[slot];
      if (!item) return s;

      return {
        equipment: { ...s.equipment, [slot]: undefined },
        inventory: [...s.inventory, { item, quantity: 1 }],
      };
    }),
}));
