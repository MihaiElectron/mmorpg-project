/**
 * character.store.ts
 * -----------------------------------------------------------------------------
 * Store global Zustand pour gérer :
 * - Le personnage connecté
 * - L’inventaire complet du joueur
 * - L’équipement par slot
 *
 * Combiné pour synchroniser :
 * - Equip/déséquipe → retire/reverse les items de l’inventaire
 * - Chargement depuis l’API
 *
 * Actions principales :
 * - setCharacter(data)   : met à jour le personnage
 * - clearCharacter()     : réinitialise le personnage
 * - toggleOpen()         : ouvre/ferme le panneau personnage
 * - loadCharacter()      : récupère le personnage + équipement + inventaire depuis le backend
 * - equipItem(itemId)    : équipe un item, met à jour l’inventaire et le slot
 * - unequipItem(slot)    : déséquipe un item, le remet dans l’inventaire
 * -----------------------------------------------------------------------------
 */

import { create } from "zustand";

export const useCharacterStore = create((set, get) => ({
  // ---------------------------------------------------------------------------
  // État initial
  // ---------------------------------------------------------------------------
  character: null,           // données du personnage
  isOpen: false,             // panneau ouvert/fermé
  inventory: [],             // Item[] NON équipés
  equipment: {},             // mapping slot → Item équipé

  // ---------------------------------------------------------------------------
  // Mutateurs simples
  // ---------------------------------------------------------------------------
  setCharacter: (data) => set({ character: data }),
  clearCharacter: () =>
    set({ character: null, inventory: [], equipment: {} }),
  toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),

  // ---------------------------------------------------------------------------
  // Charge le personnage + inventaire + équipement depuis l’API
  // ---------------------------------------------------------------------------
  loadCharacter: async () => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch("http://localhost:3000/characters/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.warn("Impossible de charger le personnage");
        return;
      }

      const data = await res.json();

      // ---------------------------------------------------------------------
      // Construction equipment map pour CharacterLayer
      // slot → Item
      // ---------------------------------------------------------------------
      const equipmentMap = {};
      data.equipment?.forEach((eq) => {
        if (eq.slot && eq.item) {
          equipmentMap[eq.slot] = eq.item;
        }
      });

      // ---------------------------------------------------------------------
      // Inventory backend = Inventory[]
      // On garde l'objet inventory complet (avec id, quantity, item) pour le frontend
      // ---------------------------------------------------------------------
      const inventory = (data.inventory || [])
        .filter((inv) => !inv.equipped)
        .map((inv) => ({
          id: inv.id,
          quantity: inv.quantity,
          equipped: inv.equipped,
          item: inv.item,
        }));

      // ---------------------------------------------------------------------
      // Mise à jour du store
      // ---------------------------------------------------------------------
      set({
        character: data,
        equipment: equipmentMap,
        inventory,
      });
    } catch (err) {
      console.error("Erreur loadCharacter:", err);
    }
  },

  // ---------------------------------------------------------------------------
  // Équipe un item depuis l’inventaire
  // ---------------------------------------------------------------------------
  equipItem: async (itemId) => {
    try {
      const token = localStorage.getItem("token");
      const characterId = get().character.id;
      const item = get().inventory.find((i) => i.id === itemId);
      if (!item) return console.warn("Item introuvable dans l’inventaire");

      const res = await fetch(
        `http://localhost:3000/characters/${characterId}/equip`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ itemId }),
        }
      );

      if (!res.ok) {
        console.error("Erreur API equipItem:", await res.text());
        return;
      }

      const updatedCharacter = await res.json();

      // Recharge proprement depuis la source de vérité
      get().loadCharacter();
    } catch (err) {
      console.error("Erreur equipItem:", err);
    }
  },

  // ---------------------------------------------------------------------------
  // Déséquipe un item depuis un slot
  // ---------------------------------------------------------------------------
  unequipItem: async (slot) => {
    try {
      const token = localStorage.getItem("token");
      const characterId = get().character.id;

      const res = await fetch(
        `http://localhost:3000/characters/${characterId}/unequip`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ slot }),
        }
      );

      if (!res.ok) {
        console.error("Erreur API unequipItem:", await res.text());
        return;
      }

      // Recharge proprement
      get().loadCharacter();
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
