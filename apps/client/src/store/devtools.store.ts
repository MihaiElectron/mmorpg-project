import { create } from "zustand";
import type { WorldObject } from "../components/DevTools/types/worldObject.types";

// ── Types legacy ───────────────────────────────────────────────────────────────
// DevToolsPos : conservé pour compatibilité avec getAdminStore().setLastClickedPos()
export type DevToolsPos = { x: number; y: number };

// ── Types espaces de coordonnées ───────────────────────────────────────────────
// Pixels Phaser (pointer.worldX / pointer.worldY)
export type DevToolsScreenPoint = { x: number; y: number };

// World Units (ADR-0001 — 1 tile = 1024 WU)
// Inverse : worldX = 8*(sx−1000) + 16*sy,  worldY = −8*(sx−1000) + 16*sy
export type DevToolsWorldPoint = { mapId: number; worldX: number; worldY: number };

// Tuile logique  — tileX = worldX >> 10,  tileY = worldY >> 10
export type DevToolsTilePoint = { mapId: number; tileX: number; tileY: number };

// Chunk  — chunkX = worldX >> 16,  chunkY = worldY >> 16  (CHUNK_SHIFT = 16)
export type DevToolsChunkPoint = { mapId: number; chunkX: number; chunkY: number };

export type DevToolsClickContext = {
  screenPoint: DevToolsScreenPoint;
  worldPoint: DevToolsWorldPoint;
  tilePoint: DevToolsTilePoint;
  chunkPoint: DevToolsChunkPoint;
};

export type DevToolsPanelPosition = { x: number; y: number };

const DEFAULT_PANEL_POSITION: DevToolsPanelPosition = { x: 0, y: 0 };

// ── Store logic ────────────────────────────────────────────────────────────────

const storeLogic = (set, get) => ({

  // ── Console ─────────────────────────────────────────────────────────────────
  isConsoleActive: false,
  commandHistory: [] as string[],
  historyIndex: -1,

  setConsoleActive: (active: boolean) => set({ isConsoleActive: active }),

  addToHistory: (cmd: string) => {
    const prev = get().commandHistory;
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

  // ── Outil actif ──────────────────────────────────────────────────────────────
  // "legacy-admin" est la seule valeur utilisée actuellement.
  // Étendu quand un ToolSystem sera introduit.
  activeTool: "legacy-admin" as string,

  setActiveTool: (toolId: string) => set({ activeTool: toolId }),

  // ── Entrée HUD DevTools ─────────────────────────────────────────────────────
  isDevToolsOpen: false,
  isEditMode: false,
  panelPosition: DEFAULT_PANEL_POSITION,

  setDevToolsOpen: (open: boolean) =>
    set({
      isDevToolsOpen: open,
      panelPosition: open ? get().panelPosition : DEFAULT_PANEL_POSITION,
    }),

  toggleDevToolsOpen: () => {
    const next = !get().isDevToolsOpen;
    set({
      isDevToolsOpen: next,
      panelPosition: next ? get().panelPosition : DEFAULT_PANEL_POSITION,
    });
  },

  setEditMode: (active: boolean) => set({ isEditMode: active }),

  setPanelPosition: (position: DevToolsPanelPosition) =>
    set({ panelPosition: position }),

  resetPanelPosition: () => set({ panelPosition: DEFAULT_PANEL_POSITION }),

  // ── Dernier clic — legacy (compatibilité admin.store) ────────────────────────
  lastClickedPos: null as DevToolsPos | null,

  setLastClickedPos: (pos: DevToolsPos) => set({ lastClickedPos: pos }),

  // ── Dernier clic — espaces de coordonnées complets ───────────────────────────
  lastClickedScreenPoint: null as DevToolsScreenPoint | null,
  lastClickedWorldPoint: null as DevToolsWorldPoint | null,
  lastClickedTilePoint: null as DevToolsTilePoint | null,
  lastClickedChunkPoint: null as DevToolsChunkPoint | null,

  setLastClickedScreenPoint: (point: DevToolsScreenPoint) =>
    set({ lastClickedScreenPoint: point }),

  setLastClickedWorldPoint: (point: DevToolsWorldPoint) =>
    set({ lastClickedWorldPoint: point }),

  setLastClickedTilePoint: (point: DevToolsTilePoint) =>
    set({ lastClickedTilePoint: point }),

  setLastClickedChunkPoint: (point: DevToolsChunkPoint) =>
    set({ lastClickedChunkPoint: point }),

  // Setter composite — met à jour les quatre espaces en une seule opération.
  setLastClickedContext: (ctx: DevToolsClickContext) =>
    set({
      lastClickedScreenPoint: ctx.screenPoint,
      lastClickedWorldPoint:  ctx.worldPoint,
      lastClickedTilePoint:   ctx.tilePoint,
      lastClickedChunkPoint:  ctx.chunkPoint,
    }),

  clearLastClickedContext: () =>
    set({
      lastClickedPos:          null,
      lastClickedScreenPoint:  null,
      lastClickedWorldPoint:   null,
      lastClickedTilePoint:    null,
      lastClickedChunkPoint:   null,
    }),

  // ── Sélection WorldObject (Studio SDK) ──────────────────────────────────────
  selectedWorldObject: null as WorldObject | null,

  setSelectedWorldObject: (obj: WorldObject) =>
    set({ selectedWorldObject: obj }),

  clearSelectedWorldObject: () =>
    set({ selectedWorldObject: null }),
});

// ── Singleton global (partagé React + Phaser) ──────────────────────────────────

const getStore = () => {
  const KEY = "__GLOBAL_DEVTOOLS_STORE__";
  if (typeof window !== "undefined") {
    if (!(window as any)[KEY]) {
      (window as any)[KEY] = create(storeLogic);
    }
    return (window as any)[KEY];
  }
  return create(storeLogic);
};

export const useDevToolsStore = (selector) => getStore()(selector);
export const getDevToolsStore = () => getStore();
