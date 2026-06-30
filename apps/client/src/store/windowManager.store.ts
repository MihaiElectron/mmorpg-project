import { create } from "zustand";

export type WindowId = string;

export type WindowDescriptor = {
  id: WindowId;
  buildingType: string;
  buildingId: string;
  title?: string;
};

type WindowManagerState = {
  windows: WindowDescriptor[];
  openWindow: (buildingType: string, buildingId: string, title?: string) => void;
  closeWindow: (id: WindowId) => void;
  closeAll: () => void;
};

const storeLogic = (set, get): WindowManagerState => ({
  windows: [],

  openWindow: (buildingType: string, buildingId: string, title?: string) => {
    const existing = get().windows.find((w) => w.id === buildingId);
    if (existing) return;
    set((state) => ({
      windows: [...state.windows, { id: buildingId, buildingType, buildingId, title }],
    }));
  },

  closeWindow: (id: WindowId) => {
    set((state) => ({ windows: state.windows.filter((w) => w.id !== id) }));
  },

  closeAll: () => set({ windows: [] }),
});

const getStore = () => {
  const KEY = "__GLOBAL_WINDOW_MANAGER_STORE__";
  if (typeof window !== "undefined") {
    if (!(window as any)[KEY]) {
      (window as any)[KEY] = create(storeLogic);
    }
    return (window as any)[KEY];
  }
  return create(storeLogic);
};

export const useWindowManagerStore = (selector: (s: WindowManagerState) => any) =>
  getStore()(selector);

export const getWindowManagerStore = (): ReturnType<typeof create<WindowManagerState>> =>
  getStore();
