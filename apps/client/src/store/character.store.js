/**
 * character.store.js
 * -----------------------------------------------------------------------------
 * Store global Zustand pour gérer les données du personnage.
 * - character : données du personnage connecté
 * - isOpen    : état d'ouverture du panneau personnage
 *
 * Actions :
 * - setCharacter(data) : met à jour le personnage
 * - clearCharacter()   : réinitialise le personnage
 * - toggleOpen()       : ouvre/ferme le panneau
 * - loadCharacter()    : récupère le personnage depuis l'API
 * - equipItem()        : équipe un item dans un slot (MVP)
 * - unequipItem()      : déséquipe un item dans un slot (MVP)
 * -----------------------------------------------------------------------------
 */

import { create } from "zustand";

export const useCharacterStore = create((set, get) => ({
  character: null,
  isOpen: false,

  // ---------------------------------------------------------------------------
  // Mutateurs simples
  // ---------------------------------------------------------------------------
  setCharacter: (data) => set({ character: data }),
  clearCharacter: () => set({ character: null }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),

  // ---------------------------------------------------------------------------
  // Charge le personnage depuis l'API
  // ---------------------------------------------------------------------------
  loadCharacter: async () => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch("http://localhost:3000/characters/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        console.warn("Impossible de charger le personnage");
        return;
      }

      const data = await res.json();
      set({ character: data });
    } catch (err) {
      console.error("Erreur loadCharacter:", err);
    }
  },

  // ---------------------------------------------------------------------------
  // Équipe un item dans un slot (MVP)
  // ---------------------------------------------------------------------------
  equipItem: async (slot, itemId) => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch("http://localhost:3000/characters/equip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slot, itemId }),
      });

      if (!res.ok) {
        console.error("Erreur API equipItem:", await res.text());
        return;
      }

      const result = await res.json();
      console.log("Item équipé:", result);

      // Recharge le personnage pour mettre à jour l'équipement
      await get().loadCharacter();
    } catch (err) {
      console.error("Erreur equipItem:", err);
    }
  },

  // ---------------------------------------------------------------------------
  // Déséquipe un item dans un slot (MVP)
  // ---------------------------------------------------------------------------
  unequipItem: async (slot) => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch("http://localhost:3000/characters/unequip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slot }),
      });

      if (!res.ok) {
        console.error("Erreur API unequipItem:", await res.text());
        return;
      }

      const result = await res.json();
      console.log("Item déséquipé:", result);

      // Recharge le personnage pour mettre à jour l'équipement
      await get().loadCharacter();
    } catch (err) {
      console.error("Erreur unequipItem:", err);
    }
  },
}));

// -----------------------------------------------------------------------------
// Expose le store dans la console du navigateur (DEV ONLY)
// -----------------------------------------------------------------------------
if (typeof window !== "undefined") {
  window.useCharacterStore = useCharacterStore;
}
