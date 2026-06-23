// DevToolsOverlayManager — centralise les couches Graphics/Text des overlays Studio.
//
// WorldScene reste responsable :
//   - des données (resourceData, animalSprites, creatureSpawnData)
//   - des subscriptions store
//   - des appels redraw
// Ce manager ne fait que gérer les objets Phaser Graphics/Text de chaque couche.

// ── Helpers de projection (WU → pixels Phaser, ADR-0001) ─────────────────────
// Formule identique à resolveScreen / resolveWomScreen dans WorldScene.js.

function _wu2px(worldX, worldY) {
  return {
    x: Math.round(1000 + (worldX - worldY) / 16),
    y: Math.round((worldX + worldY) / 32),
  };
}

function resolveScreen(entity) {
  if (Number.isFinite(entity.worldX) && Number.isFinite(entity.worldY)) {
    return _wu2px(entity.worldX, entity.worldY);
  }
  return { x: Math.round(entity.x), y: Math.round(entity.y) };
}

function resolveWomScreen(wo) {
  if (!wo.position) return null;
  return _wu2px(wo.position.worldX, wo.position.worldY);
}

function _shortId(id) {
  return id.length > 7 ? id.slice(0, 7) + "…" : id;
}

// ── Couche interne ────────────────────────────────────────────────────────────

function makeLayer() {
  return { graphics: null, labels: new Map() };
}

// ── DevToolsOverlayManager ────────────────────────────────────────────────────

export class DevToolsOverlayManager {
  constructor(scene, onSpawnClick = null) {
    this._scene        = scene;
    this._onSpawnClick = onSpawnClick;
    this._resources    = makeLayer();
    this._animals      = makeLayer();
    this._spawns       = { ...makeLayer(), zones: new Map() };
  }

  // ── Helpers internes ────────────────────────────────────────────────────────

  _clearLayer(layer) {
    if (layer.graphics) layer.graphics.clear();
    for (const text of layer.labels.values()) text.destroy();
    layer.labels.clear();
    if (layer.zones) {
      for (const zone of layer.zones.values()) zone.destroy();
      layer.zones.clear();
    }
  }

  _ensureGraphics(layer) {
    if (!layer.graphics) {
      layer.graphics = this._scene.add.graphics();
      layer.graphics.setDepth(50);
    }
  }

  _addLabel(layer, id, x, y, line1, line2, color) {
    const label = this._scene.add.text(x, y, `${line1}\n${line2}`, {
      fontSize: "9px",
      color,
      align: "center",
    });
    label.setOrigin(0.5, 1);
    label.setDepth(51);
    layer.labels.set(id, label);
  }

  // ── Resources ───────────────────────────────────────────────────────────────

  redrawResources(resourceData, enabled, selectedId) {
    this._clearLayer(this._resources);
    if (!enabled) return;
    this._ensureGraphics(this._resources);

    for (const [id, resource] of resourceData.entries()) {
      const { x, y } = resolveScreen(resource);
      const isSelected = id === selectedId;
      const color  = isSelected ? 0xf1c40f : 0x2ecc71;
      const alpha  = isSelected ? 1.0 : 0.75;
      const radius = isSelected ? 14 : 9;

      this._resources.graphics.lineStyle(isSelected ? 3 : 2, color, alpha);
      this._resources.graphics.strokeCircle(x, y - 18, radius);
      this._addLabel(this._resources, id, x, y - 34, resource.type, _shortId(id),
        isSelected ? "#f1c40f" : "#2ecc71");
    }
  }

  // ── Animals ─────────────────────────────────────────────────────────────────

  redrawAnimals(animalSprites, enabled, selectedId) {
    this._clearLayer(this._animals);
    if (!enabled) return;
    this._ensureGraphics(this._animals);

    for (const [id, entry] of animalSprites.entries()) {
      const animal = entry.animal;
      const { x, y } = resolveScreen(animal);
      const isSelected = id === selectedId;
      const color  = isSelected ? 0xf1c40f : 0xe74c3c;
      const alpha  = isSelected ? 1.0 : 0.75;
      const radius = isSelected ? 14 : 9;

      this._animals.graphics.lineStyle(isSelected ? 3 : 2, color, alpha);
      this._animals.graphics.strokeCircle(x, y - 18, radius);
      this._addLabel(this._animals, id, x, y - 34, animal.type, _shortId(id),
        isSelected ? "#f1c40f" : "#e74c3c");
    }
  }

  // ── CreatureSpawns ──────────────────────────────────────────────────────────

  redrawCreatureSpawns(spawnData, enabled, selectedId) {
    this._clearLayer(this._spawns);
    if (!enabled || spawnData.size === 0) return;
    this._ensureGraphics(this._spawns);

    for (const [id, spawn] of spawnData.entries()) {
      const pos = resolveWomScreen(spawn);
      if (!pos) continue;

      const { x, y } = pos;
      const isSelected = id === selectedId;
      const dotColor   = isSelected ? 0xf1c40f : 0x3498db;
      const alpha      = isSelected ? 1.0 : 0.8;
      const dotRadius  = isSelected ? 12 : 7;

      this._spawns.graphics.lineStyle(isSelected ? 3 : 2, dotColor, alpha);
      this._spawns.graphics.strokeCircle(x, y, dotRadius);

      // Rayon de patrouille legacy en pixels — dette : patrolRadius est en px legacy,
      // pas en WU. Affiché tel quel jusqu'à migration WU complète.
      const patrolRadius = typeof spawn.metadata?.patrolRadius === "number"
        ? spawn.metadata.patrolRadius : null;
      if (patrolRadius != null && patrolRadius > 0) {
        this._spawns.graphics.lineStyle(1, dotColor, isSelected ? 0.5 : 0.3);
        this._spawns.graphics.strokeCircle(x, y, patrolRadius);
      }

      this._addLabel(this._spawns, id, x, y - dotRadius - 5, spawn.type, _shortId(id),
        isSelected ? "#f1c40f" : "#3498db");

      if (this._onSpawnClick) {
        const zone = this._scene.add.zone(x, y, 28, 28);
        zone.setInteractive({ useHandCursor: true });
        zone.setDepth(52);
        zone.on("pointerdown", () => this._onSpawnClick(id));
        this._spawns.zones.set(id, zone);
      }
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  destroy() {
    for (const layer of [this._resources, this._animals, this._spawns]) {
      this._clearLayer(layer);
      if (layer.graphics) {
        layer.graphics.destroy();
        layer.graphics = null;
      }
    }
  }
}
