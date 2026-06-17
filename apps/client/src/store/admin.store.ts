import { create } from "zustand";

export type AdminPos = { x: number; y: number };

const storeLogic = (set, get) => ({
  isConsoleActive: false,
  lastClickedPos: null as AdminPos | null,
  commandHistory: [] as string[],
  historyIndex: -1,

  setConsoleActive: (active: boolean) => set({ isConsoleActive: active }),

  setLastClickedPos: (pos: AdminPos) => set({ lastClickedPos: pos }),

  addToHistory: (cmd: string) => {
    const prev = get().commandHistory;
    // Dédupliquer : ne pas dupliquer la commande précédente immédiate
    if (prev[0] === cmd) return;
    set({ commandHistory: [cmd, ...prev].slice(0, 50), historyIndex: -1 });
  },

  navigateHistory: (dir: "up" | "down", currentInput: string): string => {
    const { commandHistory, historyIndex } = get();
    if (commandHistory.length === 0) return currentInput;

    let next = historyIndex;

    if (dir === "up") {
      next = Math.min(historyIndex + 1, commandHistory.length - 1);
    } else {
      next = Math.max(historyIndex - 1, -1);
    }

    set({ historyIndex: next });
    return next === -1 ? "" : commandHistory[next];
  },
});

const getStore = () => {
  const KEY = "__GLOBAL_ADMIN_STORE__";
  if (typeof window !== "undefined") {
    if (!(window as any)[KEY]) {
      (window as any)[KEY] = create(storeLogic);
    }
    return (window as any)[KEY];
  }
  return create(storeLogic);
};

export const useAdminStore = (selector) => getStore()(selector);
export const getAdminStore = () => getStore();
