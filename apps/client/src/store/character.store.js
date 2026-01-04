/**
 * character.store.js
 * Store global Zustand pour gérer les données du personnage.
 */

import { create } from "zustand";

export const useCharacterStore = create((set) => ({
  character: null, // { id, name, ... }
  isOpen: false,

  setCharacter: (data) => set({ character: data }),
  clearCharacter: () => set({ character: null }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
}));
