/**
 * combatLog.store.js
 * ----------------------------------------------------------------------------
 * Store LOCAL borné des logs de jeu (feedback), alimenté côté client (Phaser →
 * React). Générique par `category` pour accueillir plus tard d'autres flux
 * (events système, loot, progression) sans multiplier les stores. Aucun réseau,
 * aucune modification de l'autorité serveur : c'est un journal d'affichage.
 */
import { create } from "zustand";

// Borne mémoire : on ne conserve que les 200 dernières entrées.
export const MAX_LOG_ENTRIES = 200;

let nextId = 1;

const storeLogic = (set) => ({
  entries: [],

  /**
   * Ajoute une entrée de log. `category` sert au filtrage par onglet
   * ("combat" aujourd'hui ; "event"/"loot"/... plus tard). `severity`
   * (défaut "info") permet une coloration par gravité ("info"|"warn"|"error")
   * sans casser les producteurs existants (appel sans severity = "info").
   */
  pushLog: ({ category = "combat", message, severity = "info" }) => {
    if (!message) return;
    set((state) => {
      const entry = { id: nextId++, category, message, severity, createdAt: Date.now() };
      const entries = [...state.entries, entry];
      // Tronque par le début si on dépasse la borne.
      if (entries.length > MAX_LOG_ENTRIES) {
        entries.splice(0, entries.length - MAX_LOG_ENTRIES);
      }
      return { entries };
    });
  },

  clearLogs: () => set({ entries: [] }),
});

// Singleton partagé Phaser/React (même pattern que character.store).
const getStore = () => {
  const KEY = "__GLOBAL_COMBAT_LOG_STORE__";
  if (typeof window !== "undefined") {
    if (!window[KEY]) {
      window[KEY] = create(storeLogic);
    }
    return window[KEY];
  }
  return create(storeLogic);
};

export const useCombatLogStore = (selector) => getStore()(selector);
export const getCombatLogStore = () => getStore();
