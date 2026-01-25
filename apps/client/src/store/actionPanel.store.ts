// src/store/actionPanel.store.ts

import { create } from "zustand";

const storeLogic = (set) => ({
  isOpen: false,
  target: null,
  actions: [],

  openPanel: (target, actions) => {
    console.log("🏪 [ActionPanelStore] openPanel:", { target, actions });
    set({
      isOpen: true,
      target,
      actions,
    });
  },

  closePanel: () =>
    set({
      isOpen: false,
      target: null,
      actions: [],
    }),
});

// Singleton Pattern pour synchronisation parfaite Phaser/React
const getStore = () => {
  const KEY = "__GLOBAL_ACTION_PANEL_STORE__";
  if (typeof window !== "undefined") {
    if (!window[KEY]) {
      window[KEY] = create(storeLogic);
      console.log("📦 [ActionPanelStore] Global Singleton Initialized");
    }
    return window[KEY];
  }
  return create(storeLogic);
};

export const useActionPanelStore = (selector) => getStore()(selector);
export const getActionPanelStore = () => getStore();
