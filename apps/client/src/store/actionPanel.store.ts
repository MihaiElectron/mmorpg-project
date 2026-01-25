// src/store/actionPanel.store.ts

import { create } from 'zustand';

// Types des objets interactifs du monde
export type WorldTarget = {
  type: string; // ex: "dead_tree", "ore", "npc"
  id: string; // ex: "dead_tree_1"
};

// Types des actions possibles
export type WorldAction = 'gather' | 'talk' | 'open' | 'mine' | 'cut';

// Store Zustand
type ActionPanelState = {
  isOpen: boolean;
  target: WorldTarget | null;
  actions: WorldAction[];
  openPanel: (target: WorldTarget, actions: WorldAction[]) => void;
  closePanel: () => void;
};

export const useActionPanelStore = create<ActionPanelState>((set) => ({
  isOpen: false,
  target: null,
  actions: [],

  openPanel: (target, actions) =>
    set({
      isOpen: true,
      target,
      actions,
    }),

  closePanel: () =>
    set({
      isOpen: false,
      target: null,
      actions: [],
    }),
}));
