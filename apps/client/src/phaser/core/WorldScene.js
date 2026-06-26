import Phaser from "phaser";

import Player from "../player/Player";
import PlayerController from "../player/PlayerController";

import { setSpriteDepth } from "../utils/depth";

import { getActionPanelStore } from "../../store/actionPanel.store";
import { getCharacterStore } from "../../store/character.store";
import { getDevToolsStore } from "../../store/devtools.store";
import { pushDebugEvent } from "../../components/DevTools/debugEventLog";
import { DevToolsOverlayManager } from "../devtools/DevToolsOverlayManager";
import {
  screenToWorldWU,
  navCellToWorldWU,
  NAV_CELL_SIZE_WU,
  TILE_SIZE_WU,
  worldWUToChunk,
  worldWUToScreen,
  worldWUToTile,
} from "../utils/worldCoordinates";
import Pathfinder from "../utils/pathfinding";
import {
  createNavGridFromWalkabilityGrid,
  createWalkabilityGridFromMap,
  getWalkabilityAtTile,
  getWalkabilityGridSize,
  getWalkabilityGridStats,
} from "../utils/walkabilityGrid";
import {
  createWalkabilityOverlayTiles,
  getTileDiamondPoints,
} from "../utils/walkabilityOverlay";
import { resolveAppearanceTexture } from "../../studio/sdk/appearanceLibrary";

const MOVEMENT_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "a",
  "d",
  "s",
  "w",
  "A",
  "D",
  "S",
  "W",
]);

// ── Studio SDK — WorldObject adapters (client-side mirror des backend adapters) ──
const RESOURCE_WO_CAPABILITIES = Object.freeze([
  "transform", "harvestable", "loot", "persistence", "validation",
]);

const CREATURE_WO_CAPABILITIES = Object.freeze([
  "transform", "combat", "health", "persistence", "validation",
]);

const CRAFTING_STATION_WO_CAPABILITIES = Object.freeze([
  "crafting_station", "placement", "validation",
]);

const CRAFTING_STATION_COLORS = Object.freeze({
  forge: 0xff8a00,
  workbench: 0x2f80ed,
  sawmill: 0x2ecc71,
  alchemy_table: 0x9b51e0,
  cooking_station: 0xe74c3c,
});

const CRAFTING_STATION_FALLBACK_COLOR = 0x8e8e8e;
const CRAFTING_STATION_SIZE = 22;
const CRAFTING_STATION_DEPTH = 12;
const CRAFTING_STATION_LABEL_STYLE = Object.freeze({
  fontFamily: "monospace",
  fontSize: "11px",
  color: "#ffffff",
  backgroundColor: "rgba(0,0,0,0.62)",
  padding: { x: 4, y: 2 },
});

function creatureToWorldObject(creature) {
  const hasWU =
    creature.worldX != null && creature.worldY != null && creature.mapId != null;
  return {
    kind: "entity",
    category: "creature",
    id: creature.id,
    type: creature.type ?? "unknown",
    mapId: creature.mapId ?? null,
    position: hasWU ? { worldX: creature.worldX, worldY: creature.worldY } : null,
    state: creature.state ?? "alive",
    health:    creature.health    ?? null,
    maxHealth: creature.maxHealth ?? null,
    capabilities: CREATURE_WO_CAPABILITIES,
    metadata: {
      legacy: null,
    },
  };
}

function resourceToWorldObject(resource) {
  const hasWU =
    resource.worldX != null && resource.worldY != null && resource.mapId != null;
  return {
    kind: "entity",
    category: "resource",
    id: resource.id,
    type: resource.type,
    mapId: resource.mapId ?? null,
    position: hasWU ? { worldX: resource.worldX, worldY: resource.worldY } : null,
    state: resource.state ?? "alive",
    remainingLoots: resource.remainingLoots ?? 0,
    capabilities: RESOURCE_WO_CAPABILITIES,
    metadata: {
      legacy: null,
    },
  };
}

function normalizeCraftingStation(station) {
  const metadata = station.metadata ?? {};
  const template = station.template ?? {};
  const position = station.position ?? {};
  const worldX = station.worldX ?? position.worldX;
  const worldY = station.worldY ?? position.worldY;
  const stationType = metadata.stationType ?? template.stationType ?? station.stationType ?? station.type ?? "unknown";
  const templateKey = metadata.templateKey ?? template.key ?? station.templateKey ?? station.type ?? stationType;

  return {
    id: station.id,
    templateId: metadata.templateId ?? station.templateId ?? template.id ?? null,
    templateKey,
    name: metadata.name ?? template.name ?? station.name ?? templateKey,
    stationType,
    mapId: station.mapId ?? 1,
    worldX,
    worldY,
    enabled: station.enabled ?? station.state === "enabled",
    templateEnabled: metadata.templateEnabled ?? template.enabled ?? true,
    interactionRadiusWU: metadata.interactionRadiusWU ?? template.interactionRadiusWU ?? station.interactionRadiusWU ?? 1536,
  };
}

function craftingStationToWorldObject(station) {
  const normalized = normalizeCraftingStation(station);
  const hasWU = Number.isFinite(normalized.worldX) && Number.isFinite(normalized.worldY);
  return {
    kind: "entity",
    category: "crafting_station",
    id: normalized.id,
    type: normalized.templateKey,
    mapId: normalized.mapId ?? null,
    position: hasWU ? { worldX: normalized.worldX, worldY: normalized.worldY } : null,
    state: normalized.enabled ? "enabled" : "disabled",
    capabilities: CRAFTING_STATION_WO_CAPABILITIES,
    metadata: {
      templateId: normalized.templateId,
      templateKey: normalized.templateKey,
      name: normalized.name,
      stationType: normalized.stationType,
      interactionRadiusWU: normalized.interactionRadiusWU,
      templateEnabled: normalized.templateEnabled,
      enabled: normalized.enabled,
    },
  };
}

function craftingStationActionLabel(station) {
  const raw = station.name || station.stationType || station.type || "station";
  return `Ouvrir ${raw.replace(/_/g, " ")}`;
}

function updateLocalCharacterPosition(position) {
  const worldX = Number(position?.worldX);
  const worldY = Number(position?.worldY);
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;

  const store = getCharacterStore().getState();
  const character = store.character;
  if (!character) return;
  store.setCharacter({
    ...character,
    positionX: worldX,
    positionY: worldY,
    mapId: position.mapId ?? character.mapId,
  });
}

// ── HP bar constants (mirrors SCSS variables) ──────────────────────────────
const HP_BAR_WIDTH = 40;
const HP_BAR_HEIGHT = 6;
const HP_BAR_OFFSET_Y = -46;
const HP_BAR_DEPTH = 18;

function getHpColor(pct) {
  if (pct >= 0.75) return 0x4caf50; // $hp-color-high
  if (pct >= 0.50) return 0xf4d03f; // $hp-color-medium
  if (pct >= 0.25) return 0xe67e22; // $hp-color-low
  return 0xc0392b;                   // $hp-color-critical
}

function createHpBar(scene, x, y) {
  const bg = scene.add.rectangle(x, y + HP_BAR_OFFSET_Y, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x000000, 0.65);
  bg.setDepth(HP_BAR_DEPTH);
  const fill = scene.add.rectangle(x - HP_BAR_WIDTH / 2, y + HP_BAR_OFFSET_Y, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x4caf50);
  fill.setOrigin(0, 0.5);
  fill.setDepth(HP_BAR_DEPTH + 1);
  return { bg, fill };
}

function updateHpBar(hpBar, health, maxHealth, x, y) {
  const pct = maxHealth > 0 ? Math.min(health / maxHealth, 1) : 0;
  hpBar.bg.setPosition(x, y + HP_BAR_OFFSET_Y);
  hpBar.fill.setPosition(x - HP_BAR_WIDTH / 2, y + HP_BAR_OFFSET_Y);
  hpBar.fill.setSize(Math.max(HP_BAR_WIDTH * pct, 1), HP_BAR_HEIGHT);
  hpBar.fill.setFillStyle(getHpColor(pct));
}

function destroyHpBar(hpBar) {
  if (!hpBar) return;
  hpBar.bg.destroy();
  hpBar.fill.destroy();
}

// Convertit des coordonnées WU en pixels Phaser (joueurs, animaux, ressources).
function resolveScreen(entity) {
  return worldWUToScreen(entity.worldX, entity.worldY);
}


export default class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: "WorldScene" });

    this.player = null;
    this.controller = null;

    this.fireCamp = null;

    this.socket = null;
    this.interactionTargets = [];
    this.resourceSprites = new Map();
    this.resourceData = new Map();
    this.craftingStationDebugObjects = new Map();
    this.craftingStationData = new Map();
    this.resourceOverlayGraphics = null;
    this.resourceOverlayLabels = new Map();
    this.creatureSpawnData = new Map();
    this.overlayManager = null;
    this.overlayStoreUnsub = null;
    this.creatureSprites = new Map();
    this.remotePlayers = new Map();
    this.terrainMap = null;
    this.terrainLayer = null;
    this.walkabilityGrid = null;
    this.navGrid = null;
    this.walkabilityOverlayGraphics = null;
    this.walkabilityHoverGraphics = null;
    this.walkabilityHoverLabel = null;
    this.pathOverlayGraphics = null;
    this.lastWalkabilityHoverTileKey = null;
    this.gatheringEventsRegistered = false;
    this.lastPlayerSyncAt = 0;
    this.lastSyncedPosition = null;
    this.windowMouseUpHandler = null;
    this.windowBlurHandler = null;
    this.windowFocusHandler = null;
    this.windowKeyDownHandler = null;
    this.windowKeyUpHandler = null;
    this.canvasMouseLeaveHandler = null;

    // Indicateur visuel de récolte (local, visible uniquement par ce client).
    this.gatherIndicator = null;

    this.autoAttackTargetId = null;
    this.autoAttackInterval = null;
    this.playerHpBar = null;
  }

  startAutoAttack(targetId) {
    this.stopAutoAttack();
    this.autoAttackTargetId = targetId;

    if (this.player && !this.playerHpBar) {
      this.playerHpBar = createHpBar(this, this.player.x, this.player.y);
    }

    let lastAttackEmitAt = 0;
    const ATTACK_INTERVAL_MS = 750;

    const tick = () => {
      if (!this.socket || !this.autoAttackTargetId) return;
      const character = getCharacterStore().getState().character;
      if (!character?.id) { this.stopAutoAttack(); return; }

      const entry = this.creatureSprites.get(targetId);
      if (!entry) return;

      const creatureScreen = worldWUToScreen(entry.creature.worldX, entry.creature.worldY);
      const dist = Math.hypot(
        creatureScreen.x - this.player.x,
        creatureScreen.y - this.player.y,
      );

      // Poursuite continue : replanifier vers la position actuelle de la créature
      if (dist > 60 && this.controller) {
        this.controller.moveTo(creatureScreen.x, creatureScreen.y);
      }

      // Attaque toutes les 750 ms (le serveur vérifie aussi le cooldown)
      const now = Date.now();
      if (now - lastAttackEmitAt >= ATTACK_INTERVAL_MS) {
        lastAttackEmitAt = now;
        this.socket.emit("attack_creature", { targetId, characterId: character.id });
      }
    };

    tick();
    this.autoAttackInterval = setInterval(tick, 300);
  }

  stopAutoAttack() {
    if (this.autoAttackInterval !== null) {
      clearInterval(this.autoAttackInterval);
      this.autoAttackInterval = null;
    }
    this.autoAttackTargetId = null;
    destroyHpBar(this.playerHpBar);
    this.playerHpBar = null;
  }

  create() {
    // on garde window.game pointant sur cette instance
    window.game = this.game;

    this.cameras.main.setBackgroundColor(0x2ecc71);
    this.input.setPollAlways();
    this.input.topOnly = false;

    // TERRAIN TILEMAP — pipeline test (isométrique 128×64, TMJ natif)
    // Temporary visual offset for the terrain pipeline test. Not the final world coordinate system.
    if (this.cache.tilemap.has("terrain_pipeline_test")) {
      try {
        const TILEMAP_TEST_OFFSET_X = 936; // centres north vertex at world x=1000
        const TILEMAP_TEST_OFFSET_Y = 0;

        const map = this.make.tilemap({ key: "terrain_pipeline_test" });
        const tileset = map.addTilesetImage("grass", "tileset_grass");
        // grass_blocked réutilise la même texture ; tiles avec gid=2 ont collision:true dans le TMJ
        const tilesetBlocked = map.addTilesetImage("grass_blocked", "tileset_grass");
        const tilesets = [tileset, tilesetBlocked].filter(Boolean);
        if (tilesets.length > 0 && map.layers.length > 0) {
          const layer = map.createLayer(map.layers[0].name, tilesets, TILEMAP_TEST_OFFSET_X, TILEMAP_TEST_OFFSET_Y);
          if (layer) {
            layer.setDepth(0);
            this.terrainMap = map;
            this.terrainLayer = layer;
            this.walkabilityGrid = createWalkabilityGridFromMap(map, layer);
            this.navGrid = createNavGridFromWalkabilityGrid(this.walkabilityGrid);
            this.pathfinder = new Pathfinder(this.navGrid);
          }
        }
      } catch (e) {
        console.warn("[WorldScene] tilemap load failed:", e.message);
      }
    }
    this.updateTerrainMapInfo();

    this.socket = this.game.socket;

    if (!this.socket) {
      console.warn("No socket found in WorldScene");
    } else {
      this.registerGatheringEvents();
    }

    // WORLD BOUNDS — dérivés de la projection WU (ADR-0001) : screenX = 1000 + (wx−wy)/16, screenY = (wx+wy)/32
    // Carte 64×64 tuiles × 1024 WU/tuile → coins : nord(1000,0) est(5096,2048) ouest(−3096,2048) sud(1000,4096)
    const _MAP_WU = 64 * 1024; // 65536 — à mettre à jour si la taille de carte change
    const _BOUNDS_X = Math.round(1000 - _MAP_WU / 16); // -3096
    const _BOUNDS_Y = 0;
    const _BOUNDS_W = Math.round(_MAP_WU / 8);          // 8192
    const _BOUNDS_H = Math.round(_MAP_WU / 16);         // 4096
    this.physics.world.setBounds(_BOUNDS_X, _BOUNDS_Y, _BOUNDS_W, _BOUNDS_H);
    this.cameras.main.setBounds(_BOUNDS_X, _BOUNDS_Y, _BOUNDS_W, _BOUNDS_H);

    // PLAYER
    const character = getCharacterStore().getState().character;
    const startX = character?.positionX ?? 400;
    const startY = character?.positionY ?? 300;
    this.player = new Player(
      this,
      startX,
      startY,
      this.getPlayerTexture(character?.sex),
    );
    setSpriteDepth(this.player);

    // FIRE CAMP
    this.fireCamp = this.add.image(600, 300, "fire_camp");
    this.fireCamp.setDepth(10);
    this.fireCamp.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.fireCamp.width, this.fireCamp.height),
      Phaser.Geom.Rectangle.Contains
    );

    // CONTROLLER
    this.controller = new PlayerController(this, this.player);

    // INPUT MAIN HANDLER
    this.input.on("pointerdown", (pointer) => {
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      pushDebugEvent({
        source: "WorldScene",
        type: "pointerdown",
        details: this.getPointerDebugDetails(pointer),
      });

      getCharacterStore().getState().closePanel?.();

      const targets = this.getGatheringTargetsAt(worldX, worldY);

      if (targets.length > 0) {
        const store = getActionPanelStore();
        const first = targets[0];
        const firstCreature = this.creatureSprites.get(first.id)?.creature;

        const overlapping = targets.map((t) => {
          const creatureData = this.creatureSprites.get(t.id)?.creature;
          return {
            id: t.id,
            type: t.type,
            kind: t.kind,
            health: creatureData?.health ?? null,
            maxHealth: creatureData?.runtimeStats?.maxHp ?? creatureData?.maxHealth ?? null,
          };
        });

        store.getState().openPanel(
          {
            id: first.id,
            type: first.type,
            kind: first.kind,
            health: firstCreature?.health ?? null,
            maxHealth: firstCreature?.runtimeStats?.maxHp ?? firstCreature?.maxHealth ?? null,
          },
          first.actions,
          overlapping.length > 1 ? overlapping : [],
        );

        if (first.kind === "resource") {
          const rd = this.resourceData.get(first.id);
          if (rd) getDevToolsStore().getState().setSelectedWorldObject(resourceToWorldObject(rd));
        }
        if (first.kind === "creature") {
          const entry = this.creatureSprites.get(first.id);
          if (entry?.creature) getDevToolsStore().getState().setSelectedWorldObject(creatureToWorldObject(entry.creature));
        }

        return;
      }

      const sx = Math.round(worldX);
      const sy = Math.round(worldY);
      const cursorContext = this.createCoordinateContext(worldX, worldY);
      getDevToolsStore().getState().setLastClickedPos({ x: sx, y: sy });
      getDevToolsStore().getState().setLastClickedContext(cursorContext);
      getDevToolsStore().getState().setCurrentCursorContext(cursorContext);
      getActionPanelStore().getState().closePanel();
      getDevToolsStore().getState().clearSelectedWorldObject();
      this.stopAutoAttack();
      this.controller.startMouseMove(worldX, worldY);
    });

    this.input.on("pointermove", (pointer) => {
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      getDevToolsStore().getState().setCurrentCursorContext(
        this.createCoordinateContext(worldPoint.x, worldPoint.y),
      );
      if (pointer.isDown) {
        pushDebugEvent({
          source: "WorldScene",
          type: "pointermove",
          details: this.getPointerDebugDetails(pointer, {
            worldX: Math.round(worldPoint.x),
            worldY: Math.round(worldPoint.y),
          }),
        });
        this.controller.updateMouseTarget(worldPoint.x, worldPoint.y);
      }
    });

    this.input.on("pointerup", (pointer) => {
      pushDebugEvent({
        source: "WorldScene",
        type: "pointerup",
        details: this.getPointerDebugDetails(pointer),
      });
      this.controller.stopMouseMove("pointerup");
    });

    this.registerPointerGuards();

    // CAMERA
    this.cameras.main.setZoom(1);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ── Studio SDK — overlay + sélection ──────────────────────────────────────
    this.overlayManager = new DevToolsOverlayManager(this, (id) => {
      const spawn = this.creatureSpawnData.get(id);
      if (spawn) getDevToolsStore().getState().setSelectedWorldObject(spawn);
    });

    this.overlayStoreUnsub = getDevToolsStore().subscribe((state, prev) => {
      const resourceOverlayChanged      = state.resourceOverlayEnabled      !== prev.resourceOverlayEnabled;
      const creatureOverlayChanged        = state.creatureOverlayEnabled        !== prev.creatureOverlayEnabled;
      const creatureSpawnOverlayChanged = state.creatureSpawnOverlayEnabled !== prev.creatureSpawnOverlayEnabled;
      const stationRadiusOverlayChanged = state.stationRadiusOverlayEnabled !== prev.stationRadiusOverlayEnabled;
      const walkabilityOverlayChanged   = state.walkabilityOverlayEnabled   !== prev.walkabilityOverlayEnabled;
      const tileCoordinatesChanged      = state.tileCoordinatesOverlayEnabled !== prev.tileCoordinatesOverlayEnabled;
      const cursorTileChanged =
        state.currentCursorTilePoint?.tileX !== prev.currentCursorTilePoint?.tileX ||
        state.currentCursorTilePoint?.tileY !== prev.currentCursorTilePoint?.tileY;
      const selectionChanged = state.selectedWorldObject?.id !== prev.selectedWorldObject?.id;
      if (resourceOverlayChanged || selectionChanged) {
        this.redrawResourceOverlay();
      }
      if (creatureOverlayChanged || selectionChanged) {
        this.redrawCreatureOverlay();
      }
      if (creatureSpawnOverlayChanged || selectionChanged) {
        this.redrawCreatureSpawnOverlay();
      }
      if (stationRadiusOverlayChanged) {
        this.redrawCraftingStationRadiusOverlay();
      }
      if (walkabilityOverlayChanged) {
        this.redrawWalkabilityOverlay();
        this.redrawPathOverlay(this.controller?.path ?? null);
      }
      if (walkabilityOverlayChanged || tileCoordinatesChanged || cursorTileChanged) {
        this.redrawWalkabilityHover();
      }
    });

    this.loadCraftingStations();
    this.joinWorld();
  }

  registerPointerGuards() {
    if (typeof window === "undefined" || !this.game?.canvas) return;

    this.windowMouseUpHandler = (event) => {
      pushDebugEvent({
        source: "WorldScene",
        type: "window_mouseup",
        details: this.getWindowDebugDetails({ button: event.button, buttons: event.buttons }),
      });
      if (this.controller?.mouseActive && this.controller.isDragging) {
        this.controller.stopMouseMove("window_mouseup");
      }
    };

    this.windowBlurHandler = () => {
      pushDebugEvent({
        source: "WorldScene",
        type: "window_blur",
        details: this.getWindowDebugDetails(),
      });
      if (this.controller?.mouseActive) {
        this.controller.stopMouseMove("window_blur");
      }
    };

    this.windowFocusHandler = () => {
      pushDebugEvent({
        source: "WorldScene",
        type: "window_focus",
        details: this.getWindowDebugDetails(),
      });
    };

    this.windowKeyDownHandler = (event) => {
      if (!MOVEMENT_KEYS.has(event.key)) return;
      pushDebugEvent({
        source: "WorldScene",
        type: "keydown",
        details: this.getWindowDebugDetails({ key: event.key, repeat: event.repeat }),
      });
    };

    this.windowKeyUpHandler = (event) => {
      if (!MOVEMENT_KEYS.has(event.key)) return;
      pushDebugEvent({
        source: "WorldScene",
        type: "keyup",
        details: this.getWindowDebugDetails({ key: event.key }),
      });
    };

    this.canvasMouseLeaveHandler = (event) => {
      pushDebugEvent({
        source: "WorldScene",
        type: "canvas_mouseleave",
        details: this.getWindowDebugDetails({
          button: event.button,
          buttons: event.buttons,
        }),
      });
      if (event.buttons === 0 && this.controller?.mouseActive && this.controller.isDragging) {
        this.controller.stopMouseMove("canvas_mouseleave_no_buttons");
      }
    };

    window.addEventListener("mouseup", this.windowMouseUpHandler);
    window.addEventListener("blur", this.windowBlurHandler);
    window.addEventListener("focus", this.windowFocusHandler);
    window.addEventListener("keydown", this.windowKeyDownHandler);
    window.addEventListener("keyup", this.windowKeyUpHandler);
    this.game.canvas.addEventListener("mouseleave", this.canvasMouseLeaveHandler);

    this.events.once("shutdown", () => {
      window.removeEventListener("mouseup", this.windowMouseUpHandler);
      window.removeEventListener("blur", this.windowBlurHandler);
      window.removeEventListener("focus", this.windowFocusHandler);
      window.removeEventListener("keydown", this.windowKeyDownHandler);
      window.removeEventListener("keyup", this.windowKeyUpHandler);
      this.game.canvas.removeEventListener("mouseleave", this.canvasMouseLeaveHandler);
    });
  }

  getPointerDebugDetails(pointer, extra = {}) {
    return {
      button: pointer.button ?? null,
      buttons: pointer.buttons ?? null,
      pointerDown: Boolean(pointer.isDown),
      pointerX: Math.round(pointer.x ?? 0),
      pointerY: Math.round(pointer.y ?? 0),
      worldX: Math.round(pointer.worldX ?? 0),
      worldY: Math.round(pointer.worldY ?? 0),
      ...this.getControllerDebugDetails(),
      ...extra,
    };
  }

  getWindowDebugDetails(extra = {}) {
    return {
      ...this.getControllerDebugDetails(),
      ...extra,
    };
  }

  getControllerDebugDetails() {
    return {
      mouseActive: this.controller?.mouseActive ?? false,
      isDragging: this.controller?.isDragging ?? false,
      isPointerHeld: this.controller?.isPointerHeld ?? false,
      isMouseHoldMovement: this.controller?.isMouseHoldMovement ?? false,
      keyboardActive: this.controller?.isKeyboardActive?.() ?? false,
      targetX: this.controller?.target ? Math.round(this.controller.target.x) : null,
      targetY: this.controller?.target ? Math.round(this.controller.target.y) : null,
    };
  }

  createCoordinateContext(screenX, screenY) {
    const roundedScreen = {
      x: Math.round(screenX),
      y: Math.round(screenY),
    };
    const world = screenToWorldWU(screenX, screenY);
    const tile = worldWUToTile(world.worldX, world.worldY);
    const chunk = worldWUToChunk(world.worldX, world.worldY);

    return {
      screenPoint: roundedScreen,
      worldPoint: { mapId: 1, ...world },
      tilePoint: { mapId: 1, ...tile },
      chunkPoint: { mapId: 1, ...chunk },
      walkable: getWalkabilityAtTile(this.walkabilityGrid, tile.tileX, tile.tileY),
    };
  }

  updateTerrainMapInfo() {
    const gridSize = getWalkabilityGridSize(this.walkabilityGrid);
    const gridStats = getWalkabilityGridStats(this.walkabilityGrid);
    const navSize = getWalkabilityGridSize(this.navGrid);
    const navStats = getWalkabilityGridStats(this.navGrid);
    getDevToolsStore().getState().setTerrainMapInfo({
      loaded: Boolean(this.terrainMap && this.terrainLayer),
      key: this.terrainMap ? "terrain_pipeline_test" : null,
      layerName: this.terrainLayer?.layer?.name ?? this.terrainLayer?.name ?? null,
      width: this.terrainMap?.width ?? null,
      height: this.terrainMap?.height ?? null,
      tileWidth: this.terrainMap?.tileWidth ?? null,
      tileHeight: this.terrainMap?.tileHeight ?? null,
      walkabilityGridWidth: gridSize.width,
      walkabilityGridHeight: gridSize.height,
      walkableCount: gridStats.walkable,
      blockedCount: gridStats.blocked,
      navGridWidth: navSize.width,
      navGridHeight: navSize.height,
      walkableNavCount: navStats.walkable,
      blockedNavCount: navStats.blocked,
    });
  }

  update(time) {
    if (this.controller) this.controller.update();
    setSpriteDepth(this.player);
    this.syncLocalPlayer(time);
    this.updateRemotePlayerLabels();
    this.updateGatherIndicator();
    this.updatePlayerHpBar();
    this.updateCreatureHpBars();
  }

  updatePlayerHpBar() {
    if (!this.playerHpBar || !this.player) return;
    const char = getCharacterStore().getState().character;
    if (!char) return;
    updateHpBar(this.playerHpBar, char.health, char.maxHealth, this.player.x, this.player.y);
  }

  updateCreatureHpBars() {
    for (const entry of this.creatureSprites.values()) {
      if (entry.hpBar) {
        updateHpBar(entry.hpBar, entry.creature.health, entry.creature.runtimeStats?.maxHp ?? entry.creature.maxHealth, entry.sprite.x, entry.sprite.y);
      }
    }
  }

  // CLICK DETECTION
  getGatheringTargetAt(x, y) {
    for (const t of this.interactionTargets) {
      const bounds = t.sprite.getBounds();
      if (bounds.contains(x, y)) return t;
    }
    return null;
  }

  getGatheringTargetsAt(x, y) {
    return this.interactionTargets.filter((t) =>
      t.sprite.getBounds().contains(x, y)
    );
  }

  // SOCKET EVENTS
  registerGatheringEvents() {
    if (this.gatheringEventsRegistered) {
      return;
    }

    if (!this.socket) {
      console.warn("No socket found in WorldScene");
      return;
    }

    this.gatheringEventsRegistered = true;

    this.socket.on("connect", () => {
      this.socket.emit("get_resources");
      this.socket.emit("get_creatures");
      this.joinWorld();
    });

    this.socket.on("resources", (resources) => {
      this.renderResources(resources);
    });

    this.socket.on("creatures", (creatures) => {
      this.renderCreatures(creatures);
    });

    this.socket.on("inventory_update", (data) => {
      const store = getCharacterStore();
      store.getState().updateInventoryItem({
        id: data.itemId,
        quantity: data.total,
        name: data.itemId.replace("_", " "),
        image: `/assets/images/items/${data.itemId}.png`,
      });
    });

    this.socket.on("creature_loot", (data) => {
      const store = getCharacterStore();
      store.getState().updateInventoryItem({
        id: data.itemId,
        quantity: data.total ?? data.quantity,
        name: (data.lootItemId || data.itemId).replace("_", " "),
        image: `/assets/images/items/${data.lootItemId || data.itemId}.png`,
      });
    });

    this.socket.on("resource_loot", (data) => {
      const item = data.item || {};
      const itemId = item.id || data.itemId;
      const itemName = item.name || itemId.replace("_", " ");
      const itemImage =
        item.image || `/assets/images/items/${data.lootItemId || data.itemId}.png`;

      const store = getCharacterStore();
      store.getState().updateInventoryItem({
        id: itemId,
        quantity: data.total ?? data.quantity,
        name: itemName,
        image: itemImage,
      });
    });

    this.socket.on("resource_update", (data) => {
      if (data.state === "dead") {
        this.removeResource(data.id);
        return;
      }
      if (data.worldX != null && data.worldY != null) {
        this.upsertResource(data);
      }
    });

    this.socket.on("gather_tick", (data) => {
      this.startGatherIndicator(data.targetId, data.duration);
    });

    this.socket.on("gather_stopped", (data) => {
      this.stopGatherIndicator(data.targetId);
    });

    this.socket.on("creature_update", (creature) => {
      if (creature.state === "dead") {
        this.removeCreature(creature.id);
        if (this.autoAttackTargetId === creature.id) {
          this.stopAutoAttack();
        }
        const panelStore = getActionPanelStore();
        if (panelStore.getState().target?.id === creature.id) {
          panelStore.getState().closePanel();
        }
        return;
      }

      this.upsertCreature(creature);

      const panelStore = getActionPanelStore();
      const panelState = panelStore.getState();
      if (panelState.target?.id === creature.id) {
        panelState.updateTargetHealth(creature.health, creature.runtimeStats?.maxHp ?? creature.maxHealth);
      }
    });

    this.socket.on("crafting_station_update", (station) => {
      if (station.deleted) {
        this.removeCraftingStation(station.id);
        return;
      }
      this.upsertCraftingStation(station);
    });

    this.socket.on("current_players", (players) => {
      this.clearRemotePlayers();
      players.forEach((player) => this.upsertRemotePlayer(player));
    });

    this.socket.on("world_joined", (player) => {
      if (!this.player) return;

      const { x, y } = resolveScreen(player);
      this.player.setPosition(x, y);
      this.lastSyncedPosition = { x, y, direction: player.direction };
      updateLocalCharacterPosition(player);
    });

    this.socket.on("player_joined", (player) => {
      this.upsertRemotePlayer(player);
    });

    this.socket.on("player_moved", (player) => {
      this.upsertRemotePlayer(player);
    });

    this.socket.on("player_left", (player) => {
      this.removeRemotePlayer(player);
    });

    this.socket.on("character_damaged", (data) => {
      getCharacterStore().getState().setHealth(data.health);
      if (!this.playerHpBar && this.player) {
        this.playerHpBar = createHpBar(this, this.player.x, this.player.y);
      }
    });

    this.socket.on("character_teleport", (data) => {
      if (this.player) {
        const { x, y } = resolveScreen(data);
        this.player.setPosition(x, y);
        this.cameras.main.centerOn(x, y);
        this.lastSyncedPosition = { x, y, direction: this.player.direction };
        updateLocalCharacterPosition(data);
      }
    });

    this.socket.on("character_respawn", (data) => {
      getCharacterStore().getState().setHealth(data.health);
      destroyHpBar(this.playerHpBar);
      this.playerHpBar = null;
      if (this.player) {
        const { x, y } = resolveScreen(data);
        this.player.setPosition(x, y);
        this.cameras.main.centerOn(x, y);
        this.lastSyncedPosition = { x, y, direction: "down" };
        updateLocalCharacterPosition(data);
      }
    });

    if (this.socket.connected) {
      this.socket.emit("get_resources");
      this.socket.emit("get_creatures");
      this.loadCraftingStations();
      this.joinWorld();
    }
  }

  joinWorld() {
    if (!this.socket || !this.player) return;

    const character = getCharacterStore().getState().character;
    if (!character?.id) return;

    this.socket.emit("join_world", {
      characterId: character.id,
      name: character.name,
      sex: character.sex,
      x: this.player.x,
      y: this.player.y,
      direction: this.player.direction,
    });
  }

  syncLocalPlayer(time) {
    if (!this.socket || !this.socket.connected || !this.player) return;
    if (time - this.lastPlayerSyncAt < 80) return;

    const px = Math.round(this.player.x);
    const py = Math.round(this.player.y);
    const wu = screenToWorldWU(px, py);
    const position = {
      worldX: wu.worldX,
      worldY: wu.worldY,
      mapId: 1,
      direction: this.player.direction,
    };

    const previous = this.lastSyncedPosition;
    const hasMoved =
      !previous ||
      previous.worldX !== position.worldX ||
      previous.worldY !== position.worldY ||
      previous.direction !== position.direction;

    if (!hasMoved) return;

    this.lastPlayerSyncAt = time;
    this.lastSyncedPosition = position;
    pushDebugEvent({
      source: "WorldScene",
      type: "socket_player_move_emit",
      details: {
        worldX: position.worldX,
        worldY: position.worldY,
        mapId: position.mapId,
        direction: position.direction,
      },
    });
    this.socket.emit("player_move", position);
    updateLocalCharacterPosition(position);
  }

  upsertRemotePlayer(player) {
    if (!player?.characterId || player.socketId === this.socket?.id) return;

    const { x, y } = resolveScreen(player);

    const existing = this.remotePlayers.get(player.characterId);
    if (existing) {
      this.tweens.add({
        targets: existing.sprite,
        x,
        y,
        duration: 90,
        ease: "Linear",
      });

      existing.nameText.setText(player.name || "Joueur");
      existing.nameText.setPosition(x, y - 34);
      existing.socketId = player.socketId;
      setSpriteDepth(existing.sprite);
      existing.nameText.setDepth(existing.sprite.depth + 1);
      return;
    }

    const sprite = this.add.sprite(
      x,
      y,
      this.getPlayerTexture(player.sex),
    );
    sprite.setTint(0x66ccff);
    setSpriteDepth(sprite);
    sprite.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, sprite.width, sprite.height),
      Phaser.Geom.Rectangle.Contains,
    );

    const nameText = this.add
      .text(x, y - 34, player.name || "Joueur", {
        fontSize: "12px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    nameText.setDepth(sprite.depth + 1);

    this.remotePlayers.set(player.characterId, {
      sprite,
      nameText,
      socketId: player.socketId,
    });

    this.interactionTargets.push({
      sprite,
      id: player.characterId,
      type: player.name || "joueur",
      kind: "player",
      actions: ["inspecter"],
    });
  }

  getPlayerTexture(sex) {
    return sex === "female" ? "player_female_32x64" : "player_male_32x64";
  }

  removeRemotePlayer(player) {
    const remote = player?.characterId
      ? this.remotePlayers.get(player.characterId)
      : null;
    if (!remote) return;

    if (player.socketId && remote.socketId !== player.socketId) return;

    remote.sprite.destroy();
    remote.nameText.destroy();
    this.remotePlayers.delete(player.characterId);
    this.interactionTargets = this.interactionTargets.filter(
      (t) => !(t.kind === "player" && t.id === player.characterId),
    );
  }

  updateRemotePlayerLabels() {
    for (const remote of this.remotePlayers.values()) {
      remote.nameText.setPosition(remote.sprite.x, remote.sprite.y - 34);
      remote.nameText.setDepth(remote.sprite.depth + 1);
    }
  }

  clearRemotePlayers() {
    for (const [characterId, remote] of this.remotePlayers.entries()) {
      remote.sprite.destroy();
      remote.nameText.destroy();
      this.remotePlayers.delete(characterId);
    }
    this.interactionTargets = this.interactionTargets.filter(
      (t) => t.kind !== "player",
    );
  }

  // -----------------------------------------------------------------------
  // INDICATEUR DE RÉCOLTE (local, visible uniquement par ce joueur)
  // -----------------------------------------------------------------------
  startGatherIndicator(targetId, duration) {
    if (this.gatherIndicator && this.gatherIndicator.targetId !== targetId) {
      this.gatherIndicator.graphics.destroy();
      this.gatherIndicator = null;
    }

    if (!this.gatherIndicator) {
      const graphics = this.add.graphics();
      graphics.setDepth(20);
      this.gatherIndicator = { targetId, graphics, startTime: this.time.now, duration };
      return;
    }

    // Même cible : on resynchronise juste le timer du cycle suivant.
    this.gatherIndicator.startTime = this.time.now;
    this.gatherIndicator.duration = duration;
  }

  stopGatherIndicator(targetId) {
    if (!this.gatherIndicator || this.gatherIndicator.targetId !== targetId) return;

    this.gatherIndicator.graphics.destroy();
    this.gatherIndicator = null;
  }

  updateGatherIndicator() {
    if (!this.gatherIndicator) return;

    const sprite = this.resourceSprites.get(this.gatherIndicator.targetId);
    if (!sprite) {
      this.stopGatherIndicator(this.gatherIndicator.targetId);
      return;
    }

    const { graphics, startTime, duration } = this.gatherIndicator;
    const progress = Phaser.Math.Clamp((this.time.now - startTime) / duration, 0, 1);

    const x = sprite.x;
    const y = sprite.y - 40;
    const radius = 10;

    graphics.clear();
    graphics.lineStyle(3, 0x000000, 0.4);
    graphics.strokeCircle(x, y, radius);

    graphics.lineStyle(3, 0x00ff66, 1);
    graphics.beginPath();
    graphics.arc(
      x,
      y,
      radius,
      Phaser.Math.DegToRad(-90),
      Phaser.Math.DegToRad(-90 + progress * 360),
      false,
    );
    graphics.strokePath();
  }

  renderResources(resources) {
    this.clearResources();

    resources
      .filter((resource) => resource.state === "alive")
      .forEach((resource) => {
        const { x, y } = resolveScreen(resource);
        const textureKey = resolveAppearanceTexture({
          appearanceKey: resource.type,
          textureKey: resource.textureKey,
          fallbackTextureKey: "dead_tree",
          isLoaded: (key) => this.textures.exists(key),
        });

        const sprite = this.add.image(x, y, textureKey);
        sprite.setDepth(10);
        sprite.setInteractive(
          new Phaser.Geom.Rectangle(0, 0, sprite.width, sprite.height),
          Phaser.Geom.Rectangle.Contains
        );

        this.resourceSprites.set(resource.id, sprite);
        this.resourceData.set(resource.id, resource);
        this.interactionTargets.push({
          sprite,
          id: resource.id,
          type: resource.type,
          kind: "resource",
          actions: ["ramasser"],
        });
      });
    this.redrawResourceOverlay();
  }

  upsertResource(resource) {
    const { x, y } = resolveScreen(resource);
    const existing = this.resourceSprites.get(resource.id);
    if (existing) {
      this.tweens.add({ targets: existing, x, y, duration: 200, ease: "Linear" });
      return;
    }

    const textureKey = resolveAppearanceTexture({
      appearanceKey: resource.type,
      textureKey: resource.textureKey,
      fallbackTextureKey: "dead_tree",
      isLoaded: (key) => this.textures.exists(key),
    });
    const sprite = this.add.image(x, y, textureKey);
    sprite.setDepth(10);
    sprite.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, sprite.width, sprite.height),
      Phaser.Geom.Rectangle.Contains
    );

    this.resourceSprites.set(resource.id, sprite);
    this.resourceData.set(resource.id, resource);
    this.interactionTargets.push({
      sprite,
      id: resource.id,
      type: resource.type,
      kind: "resource",
      actions: ["ramasser"],
    });
    this.redrawResourceOverlay();
  }

  // ── Crafting Stations debug render ───────────────────────────────────────

  loadCraftingStations() {
    const token = localStorage.getItem("token") ?? "";
    if (!token) return;

    fetch(`${import.meta.env.VITE_API_URL}/admin/crafting-stations/world-objects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((stations) => this.renderCraftingStations(stations))
      .catch((err) => {
        console.warn("[CraftingStationsDebug] fetch failed:", err);
      });
  }

  renderCraftingStations(stations) {
    this.clearCraftingStations();
    stations
      .map((station) => normalizeCraftingStation(station))
      .filter((station) =>
        station.enabled &&
        station.templateEnabled &&
        Number.isFinite(station.worldX) &&
        Number.isFinite(station.worldY),
      )
      .forEach((station) => this.upsertCraftingStation(station));
  }

  upsertCraftingStation(rawStation) {
    const station = normalizeCraftingStation(rawStation);
    if (!station.enabled || !station.templateEnabled) {
      this.removeCraftingStation(station.id);
      return;
    }
    if (!Number.isFinite(station.worldX) || !Number.isFinite(station.worldY)) return;

    const { x, y } = resolveScreen(station);
    const color = CRAFTING_STATION_COLORS[station.stationType] ?? CRAFTING_STATION_FALLBACK_COLOR;
    const existing = this.craftingStationDebugObjects.get(station.id);
    const labelText = station.name || station.stationType;

    if (existing) {
      existing.station = station;
      existing.square.setPosition(x, y);
      existing.square.setFillStyle(color, 0.92);
      existing.label.setPosition(x, y - 25);
      existing.label.setText(labelText);
      this.drawCraftingStationRadius(existing.radius, x, y, station.interactionRadiusWU, color);
      this.craftingStationData.set(station.id, station);
      return;
    }

    const radius = this.add.graphics();
    radius.setDepth(CRAFTING_STATION_DEPTH - 1);
    this.drawCraftingStationRadius(radius, x, y, station.interactionRadiusWU, color);

    const square = this.add.rectangle(x, y, CRAFTING_STATION_SIZE, CRAFTING_STATION_SIZE, color, 0.92);
    square.setStrokeStyle(2, 0x111111, 0.75);
    square.setDepth(CRAFTING_STATION_DEPTH);
    square.setInteractive(
      new Phaser.Geom.Rectangle(
        -CRAFTING_STATION_SIZE / 2,
        -CRAFTING_STATION_SIZE / 2,
        CRAFTING_STATION_SIZE,
        CRAFTING_STATION_SIZE,
      ),
      Phaser.Geom.Rectangle.Contains,
    );
    square.on("pointerdown", (_pointer, _localX, _localY, event) => {
      event?.stopPropagation();
      getActionPanelStore().getState().openPanel(
        {
          id: station.id,
          type: station.stationType,
          kind: "crafting_station",
          name: station.name,
          stationType: station.stationType,
          worldX: station.worldX,
          worldY: station.worldY,
          interactionRadiusWU: station.interactionRadiusWU,
          enabled: station.enabled,
          health: null,
          maxHealth: null,
        },
        [craftingStationActionLabel(station)],
      );
      getDevToolsStore().getState().setSelectedWorldObject(craftingStationToWorldObject(station));
    });

    const label = this.add.text(x, y - 25, labelText, CRAFTING_STATION_LABEL_STYLE);
    label.setOrigin(0.5, 1);
    label.setDepth(CRAFTING_STATION_DEPTH + 1);

    this.craftingStationDebugObjects.set(station.id, { square, label, radius, station });
    this.craftingStationData.set(station.id, station);
  }

  drawCraftingStationRadius(graphics, x, y, radiusWU, color) {
    graphics.clear();
    graphics.setVisible(getDevToolsStore().getState().stationRadiusOverlayEnabled);
    if (!getDevToolsStore().getState().stationRadiusOverlayEnabled) return;

    const radius = Number(radiusWU);
    if (!Number.isFinite(radius) || radius <= 0) return;

    const width = Math.max(radius / 8, 8);
    const height = Math.max(radius / 16, 4);
    graphics.lineStyle(1, color, 0.42);
    graphics.strokeEllipse(x, y, width, height);
  }

  redrawCraftingStationRadiusOverlay() {
    for (const entry of this.craftingStationDebugObjects.values()) {
      const { x, y } = resolveScreen(entry.station);
      const color = CRAFTING_STATION_COLORS[entry.station.stationType] ?? CRAFTING_STATION_FALLBACK_COLOR;
      this.drawCraftingStationRadius(entry.radius, x, y, entry.station.interactionRadiusWU, color);
    }
  }

  renderCreatures(creatures) {
    this.clearCreatures();

    creatures
      .filter((creature) => creature.state === "alive")
      .forEach((creature) => this.upsertCreature(creature));

    this.redrawCreatureOverlay();
  }

  upsertCreature(creature) {
    const { x, y } = resolveScreen(creature);
    const existing = this.creatureSprites.get(creature.id);

    if (existing) {
      existing.creature = creature;
      this.tweens.add({
        targets: existing.sprite,
        x,
        y,
        duration: 180,
        ease: "Linear",
      });

      const inCombat = creature.state === "fighting" || creature.state === "escaping";
      if (inCombat && !existing.hpBar) {
        existing.hpBar = createHpBar(this, existing.sprite.x, existing.sprite.y);
      } else if (!inCombat && existing.hpBar) {
        destroyHpBar(existing.hpBar);
        existing.hpBar = null;
      }
      return;
    }

    const textureKey = resolveAppearanceTexture({
      appearanceKey: creature.type,
      textureKey: creature.textureKey,
      fallbackTextureKey: "turkey",
      isLoaded: (key) => this.textures.exists(key),
    });
    const sprite = this.add.image(x, y, textureKey);
    sprite.setDepth(10);
    sprite.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, sprite.width, sprite.height),
      Phaser.Geom.Rectangle.Contains,
    );

    const inCombat = creature.state === "fighting" || creature.state === "escaping";
    const hpBar = inCombat ? createHpBar(this, x, y) : null;
    if (hpBar) updateHpBar(hpBar, creature.health, creature.runtimeStats?.maxHp ?? creature.maxHealth, x, y);

    this.creatureSprites.set(creature.id, { sprite, creature, hpBar });
    this.interactionTargets.push({
      sprite,
      id: creature.id,
      type: creature.type,
      kind: "creature",
      actions: ["attaquer"],
    });
    this.redrawCreatureOverlay();
  }

  // ── Studio SDK — Creature Overlay ──────────────────────────────────────────

  redrawCreatureOverlay() {
    const state = getDevToolsStore().getState();
    this.overlayManager.redrawCreatures(
      this.creatureSprites, state.creatureOverlayEnabled, state.selectedWorldObject?.id ?? null,
    );
  }

  // ── Studio SDK — Resource Overlay ─────────────────────────────────────────

  redrawResourceOverlay() {
    const state = getDevToolsStore().getState();
    this.overlayManager.redrawResources(
      this.resourceData, state.resourceOverlayEnabled, state.selectedWorldObject?.id ?? null,
    );
  }

  // ── Studio SDK — CreatureSpawn Overlay ──────────────────────────────────────

  redrawCreatureSpawnOverlay() {
    const state = getDevToolsStore().getState();
    const enabled    = state.creatureSpawnOverlayEnabled;
    const selectedId = state.selectedWorldObject?.id ?? null;

    this.overlayManager.redrawCreatureSpawns(this.creatureSpawnData, enabled, selectedId);

    if (!enabled || this.creatureSpawnData.size > 0) return;

    // Premier toggle ON : charger les données depuis le backend, puis redraw.
    const token = localStorage.getItem("token") ?? "";
    fetch(`${import.meta.env.VITE_API_URL}/admin/creature-spawns/world-objects`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((items) => {
        for (const item of items) {
          this.creatureSpawnData.set(item.id, item);
        }
        if (getDevToolsStore().getState().creatureSpawnOverlayEnabled) {
          const s = getDevToolsStore().getState();
          this.overlayManager.redrawCreatureSpawns(this.creatureSpawnData, true, s.selectedWorldObject?.id ?? null);
        }
      })
      .catch((err) => {
        console.warn("[CreatureSpawnOverlay] fetch failed:", err);
      });
  }

  // ── Studio SDK — Walkability Overlay ───────────────────────────────────────

  ensureWalkabilityOverlayGraphics() {
    if (!this.walkabilityOverlayGraphics) {
      this.walkabilityOverlayGraphics = this.add.graphics();
      this.walkabilityOverlayGraphics.setDepth(45);
    }
    if (!this.walkabilityHoverGraphics) {
      this.walkabilityHoverGraphics = this.add.graphics();
      this.walkabilityHoverGraphics.setDepth(46);
    }
  }

  clearWalkabilityOverlay() {
    if (this.walkabilityOverlayGraphics) {
      this.walkabilityOverlayGraphics.clear();
    }
    this.clearWalkabilityHover();
  }

  clearWalkabilityHover() {
    if (this.walkabilityHoverGraphics) {
      this.walkabilityHoverGraphics.clear();
    }
    if (this.walkabilityHoverLabel) {
      this.walkabilityHoverLabel.destroy();
      this.walkabilityHoverLabel = null;
    }
    this.lastWalkabilityHoverTileKey = null;
  }

  destroyWalkabilityOverlay() {
    this.clearWalkabilityHover();
    if (this.walkabilityHoverGraphics) {
      this.walkabilityHoverGraphics.destroy();
      this.walkabilityHoverGraphics = null;
    }
    if (this.walkabilityOverlayGraphics) {
      this.walkabilityOverlayGraphics.destroy();
      this.walkabilityOverlayGraphics = null;
    }
    if (this.pathOverlayGraphics) {
      this.pathOverlayGraphics.destroy();
      this.pathOverlayGraphics = null;
    }
  }

  redrawPathOverlay(path) {
    if (!this.pathOverlayGraphics) {
      this.pathOverlayGraphics = this.add.graphics();
      this.pathOverlayGraphics.setDepth(48);
    }
    this.pathOverlayGraphics.clear();

    const enabled = getDevToolsStore().getState().walkabilityOverlayEnabled;
    if (!enabled || !path || path.length === 0) return;

    // Ligne reliant les centres des nav cells
    this.pathOverlayGraphics.lineStyle(2, 0xf1c40f, 0.85);
    for (let i = 0; i < path.length; i++) {
      const wu = navCellToWorldWU(path[i].x, path[i].y);
      const center = worldWUToScreen(wu.worldX + NAV_CELL_SIZE_WU / 2, wu.worldY + NAV_CELL_SIZE_WU / 2);
      if (i === 0) this.pathOverlayGraphics.moveTo(center.x, center.y);
      else this.pathOverlayGraphics.lineTo(center.x, center.y);
    }
    this.pathOverlayGraphics.strokePath();

    // Points aux sommets du chemin
    this.pathOverlayGraphics.fillStyle(0xf1c40f, 0.9);
    for (const wp of path) {
      const wu = navCellToWorldWU(wp.x, wp.y);
      const center = worldWUToScreen(wu.worldX + NAV_CELL_SIZE_WU / 2, wu.worldY + NAV_CELL_SIZE_WU / 2);
      this.pathOverlayGraphics.fillCircle(center.x, center.y, 3);
    }
  }

  redrawWalkabilityOverlay() {
    const state = getDevToolsStore().getState();
    this.ensureWalkabilityOverlayGraphics();
    this.walkabilityOverlayGraphics.clear();

    if (!state.walkabilityOverlayEnabled || !this.walkabilityGrid) {
      this.clearWalkabilityHover();
      return;
    }

    for (const tile of createWalkabilityOverlayTiles(this.walkabilityGrid)) {
      const color = tile.walkable ? 0x66ff99 : 0xff4d4d;
      const alpha = tile.walkable ? 0.18 : 0.55;
      this.walkabilityOverlayGraphics.lineStyle(1, color, alpha);
      this.walkabilityOverlayGraphics.strokePoints(tile.points, true);
    }
  }

  redrawWalkabilityHover() {
    const state = getDevToolsStore().getState();
    const tile = state.currentCursorTilePoint;
    const enabled = state.walkabilityOverlayEnabled;
    const tileKey = tile ? `${tile.tileX},${tile.tileY}` : null;

    if (!enabled || !tile) {
      this.clearWalkabilityHover();
      return;
    }

    this.ensureWalkabilityOverlayGraphics();
    this.walkabilityHoverGraphics.clear();
    if (this.walkabilityHoverLabel) {
      this.walkabilityHoverLabel.destroy();
      this.walkabilityHoverLabel = null;
    }

    const walkable = getWalkabilityAtTile(this.walkabilityGrid, tile.tileX, tile.tileY);
    if (walkable === null) {
      this.lastWalkabilityHoverTileKey = tileKey;
      return;
    }

    const points = getTileDiamondPoints(tile.tileX, tile.tileY);
    this.walkabilityHoverGraphics.lineStyle(3, 0xf1c40f, 0.95);
    this.walkabilityHoverGraphics.strokePoints(points, true);
    this.walkabilityHoverGraphics.fillStyle(walkable ? 0x66ff99 : 0xff4d4d, 0.12);
    this.walkabilityHoverGraphics.fillPoints(points, true);

    if (state.tileCoordinatesOverlayEnabled) {
      const center = worldWUToScreen(
        (tile.tileX + 0.5) * TILE_SIZE_WU,
        (tile.tileY + 0.5) * TILE_SIZE_WU,
      );
      this.walkabilityHoverLabel = this.add
        .text(center.x, center.y, `${tile.tileX},${tile.tileY}`, {
          fontSize: "10px",
          color: "#f1c40f",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0.5);
      this.walkabilityHoverLabel.setDepth(47);
    }

    this.lastWalkabilityHoverTileKey = tileKey;
  }

  clearResources() {
    for (const sprite of this.resourceSprites.values()) {
      sprite.destroy();
    }

    this.resourceSprites.clear();
    this.resourceData.clear();
    this.interactionTargets = this.interactionTargets.filter(
      (target) => target.kind !== "resource",
    );
    this.redrawResourceOverlay();
  }

  clearCreatures() {
    for (const entry of this.creatureSprites.values()) {
      entry.sprite.destroy();
      destroyHpBar(entry.hpBar);
    }

    this.creatureSprites.clear();
    this.interactionTargets = this.interactionTargets.filter(
      (target) => target.kind !== "creature",
    );
    this.redrawCreatureOverlay();
  }

  removeResource(resourceId) {
    const sprite = this.resourceSprites.get(resourceId);

    if (sprite) {
      sprite.destroy();
      this.resourceSprites.delete(resourceId);
    }

    this.resourceData.delete(resourceId);
    this.interactionTargets = this.interactionTargets.filter(
      (target) => target.id !== resourceId,
    );

    this.stopGatherIndicator(resourceId);
    this.redrawResourceOverlay();
  }

  clearCraftingStations() {
    for (const entry of this.craftingStationDebugObjects.values()) {
      entry.square.destroy();
      entry.label.destroy();
      entry.radius.destroy();
    }
    this.craftingStationDebugObjects.clear();
    this.craftingStationData.clear();
  }

  removeCraftingStation(stationId) {
    const entry = this.craftingStationDebugObjects.get(stationId);
    if (entry) {
      entry.square.destroy();
      entry.label.destroy();
      entry.radius.destroy();
      this.craftingStationDebugObjects.delete(stationId);
    }
    this.craftingStationData.delete(stationId);
  }

  removeCreature(creatureId) {
    const entry = this.creatureSprites.get(creatureId);

    if (entry) {
      entry.sprite.destroy();
      destroyHpBar(entry.hpBar);
      this.creatureSprites.delete(creatureId);
    }

    this.interactionTargets = this.interactionTargets.filter(
      (target) => target.id !== creatureId,
    );
    this.redrawCreatureOverlay();
  }

  destroy() {
    if (this.socket) {
      this.socket.off("connect");
      this.socket.off("resources");
      this.socket.off("creatures");
      this.socket.off("inventory_update");
      this.socket.off("creature_loot");
      this.socket.off("resource_loot");
      this.socket.off("resource_update");
      this.socket.off("gather_tick");
      this.socket.off("gather_stopped");
      this.socket.off("creature_update");
      this.socket.off("crafting_station_update");
      this.socket.off("current_players");
      this.socket.off("world_joined");
      this.socket.off("player_joined");
      this.socket.off("player_moved");
      this.socket.off("player_left");
    }

    if (this.gatherIndicator) {
      this.gatherIndicator.graphics.destroy();
      this.gatherIndicator = null;
    }

    if (this.overlayStoreUnsub) {
      this.overlayStoreUnsub();
      this.overlayStoreUnsub = null;
    }
    if (this.overlayManager) {
      this.overlayManager.destroy();
      this.overlayManager = null;
    }
    this.destroyWalkabilityOverlay();
    this.creatureSpawnData.clear();

    this.clearResources();
    this.clearCraftingStations();
    destroyHpBar(this.playerHpBar);
    this.playerHpBar = null;
    this.clearCreatures();
    this.clearRemotePlayers();
    super.destroy();
  }
}
