import { create } from "zustand";

export type PanelTarget = {
  id: string;
  type: string;
  kind: string;
  health: number | null;
  maxHealth: number | null;
};

const storeLogic = (set, get) => ({
  isOpen: false,
  target: null as PanelTarget | null,
  actions: [] as string[],
  overlappingTargets: [] as PanelTarget[],

  openPanel: (target: PanelTarget, actions: string[], overlapping: PanelTarget[] = []) => {
    set({ isOpen: true, target, actions, overlappingTargets: overlapping });
  },

  closePanel: () =>
    set({ isOpen: false, target: null, actions: [], overlappingTargets: [] }),

  updateTargetHealth: (health: number, maxHealth: number) =>
    set((state) =>
      state.target ? { target: { ...state.target, health, maxHealth } } : {},
    ),

  selectOverlapTarget: (id: string) => {
    const found = get().overlappingTargets.find((t: PanelTarget) => t.id === id);
    if (found) set({ target: found });
  },
});

const getStore = () => {
  const KEY = "__GLOBAL_ACTION_PANEL_STORE__";
  if (typeof window !== "undefined") {
    if (!window[KEY]) {
      window[KEY] = create(storeLogic);
    }
    return window[KEY];
  }
  return create(storeLogic);
};

export const useActionPanelStore = (selector) => getStore()(selector);
export const getActionPanelStore = () => getStore();
