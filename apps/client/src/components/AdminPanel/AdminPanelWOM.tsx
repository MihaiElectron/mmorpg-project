import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { getDevToolsStore, useDevToolsStore } from "../../store/devtools.store";
import { parseCommand } from "../../phaser/admin/commandParser";
import { commandRegistry, autocompleteCommand } from "../../phaser/admin/commandRegistry";
import { type WorldObject } from "../DevTools/types/worldObject.types";
import {
  type FieldDef,
  type GroupedSectionConfig,
  type SectionConfig,
  type ConsoleLine,
  type InstanceAction,
  ITEMS_PER_PAGE,
  fetchAdmin,
  ackPromise,
  getSocket,
  getAdminCharacterId,
  kbHandlers,
  useDraft,
  usePagination,
  PaginationControls,
  AdminSectionTitle,
  StatField,
  startDrag,
  GroupedSection,
  EntitySection,
} from "./adminPanel.shared";
import RecipesSection from "./RecipesSection";
import AdminCharacterPanel from "./AdminCharacterPanel";
import {
  PLAYER_PROGRESSION_FIELDS,
  PLAYER_PRIMARY_STAT_FIELDS,
  PLAYER_LEGACY_FIELDS,
  PLAYER_COMBAT_FIELDS,
  PLAYER_EDITABLE_FIELDS,
  PLAYER_DERIVED_ROWS,
  formatDerived,
} from "./playerStatsFields";
import RuntimeStatsPanel from "../DevTools/modules/PlayerRuntime/RuntimeStatsPanel";
import RuntimeInspectorPanel from "../DevTools/modules/PlayerRuntime/RuntimeInspectorPanel";
import AssetPicker from "../DevTools/AssetPicker";
import CreatureAbilitiesEditor from "../DevTools/CreatureAbilitiesEditor";
import CreatureRuntimeInspector from "../DevTools/CreatureRuntimeInspector";

const API = import.meta.env.VITE_API_URL as string;

async function postAdmin(path: string): Promise<{ success: boolean; message: string }> {
  const token = localStorage.getItem("token") ?? "";
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  return {
    success: res.ok,
    message: (body as any).message ?? (res.ok ? "OK" : `Erreur ${res.status}`),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Overview = {
  templates: number;
  spawns: number;
  activeCreatures: number;
  connectedPlayers: number;
  registeredCharacters: number;
};

type MovementMetrics = {
  totalMoves: number;
  suspectTeleports: number;
  suspectSpeed: number;
  invalidCoordinates: number;
  mapMismatch: number;
};

// ── Constantes partagées (stations, buildings) ──────────────────────────────────

const STATION_TYPES = ["forge", "workbench", "sawmill", "alchemy_table", "cooking_station", "tailoring_station", "jewelry_table"];
const BUILDING_TYPES = ["auction_house", "mailbox", "bank", "guild_hall", "house_door", "teleport", "dungeon_entrance", "shrine"];
const BUILDING_STATES = ["ACTIVE", "DISABLED", "LOCKED", "UNDER_CONSTRUCTION", "DESTROYED"];

// ── Estimation XP mastery récolte (lecture seule) ───────────────────────────────
// TODO(shared): dupliquer temporairement la résolution + le calcul du Runtime.
// Le module mastery-xp-calculator vit dans api-gateway (pas d'alias cross-app côté
// client). À factoriser dans un package partagé. Toute évolution de la formule
// runtime (BASE_XP gathering / difficulty) doit être répercutée ici.
// Miroir EXACT de ResourcesGateway.GATHERING_RESOURCE_MASTERY_MAP + calculateMasteryXp
// (domain=gathering, action=gather, success=true, difficulty=0, quality=null).
// Doit rester identique au runtime : une estimation affichée pour un type non
// mappé côté runtime serait mensongère.
const GATHERING_RESOURCE_MASTERY_MAP: Record<string, string> = {
  dead_tree: "woodcutting",
  ore: "mining",
};

function estimateGatherMasteryXp(
  resourceType: string,
  difficulty: number,
): { masteryKey: string; xpAmount: number } | null {
  const masteryKey = GATHERING_RESOURCE_MASTERY_MAP[resourceType];
  if (!masteryKey) return null;
  const BASE_GATHER_XP = 10; // BASE_XP.gathering.gather (runtime)
  const d = Math.max(0, Math.min(100, Number(difficulty) || 0));
  const difficultyBonus = Math.floor(d / 10); // DIFFICULTY_DIVISOR = 10
  const qualityBonus = 0;                      // quality=null
  const xpAmount = Math.max(1, Math.round(BASE_GATHER_XP + difficultyBonus + qualityBonus));
  return { masteryKey, xpAmount };
}

function gatherMasteryXpLabel(resourceType: string, difficulty: number): string {
  const est = estimateGatherMasteryXp(resourceType, difficulty);
  if (!est) return "XP maîtrise estimée : aucune";
  const masteryName = est.masteryKey.charAt(0).toUpperCase() + est.masteryKey.slice(1);
  return `XP maîtrise estimée : +${est.xpAmount} ${masteryName}`;
}

// ── Configs (identiques au legacy) ────────────────────────────────────────────

function buildGroupedSectionConfigs(masteryKeys: string[]): GroupedSectionConfig[] {
  const masteryKeyOptions = ["", ...masteryKeys];
  return [
  {
    id: "creatures",
    title: "Creature Editor",
    getGroupKey:  (t) => t.key,
    getGroupName: (t) => t.name,
    groupFields: [
      { key: "name",             label: "Nom",          type: "text" as const },
      { key: "textureKey",       label: "Texture",      type: "asset" as const, assetCategory: "bestiary" },
      { key: "baseHealth",       label: "PV",           min: 1 },
      { key: "baseAttack",       label: "ATK",          min: 0 },
      { key: "baseArmor",        label: "ARM",          min: 0 },
      { key: "aggroRadius",            label: "Aggro",           min: 0 },
      { key: "fleeThresholdPct",       label: "Fuite%",          min: 0 },
      { key: "respawnDelayMs",         label: "Respawn (ms)",    min: 1, step: 1000 },
      { key: "killCharacterXpReward",  label: "XP perso (kill)", min: 0 },
    ],
    groupSaveEvent: "admin:update_template",
    getGroupSavePayload: (t, fields) => ({ key: t.key, fields }),
    dragEvent: "admin:spawn",
    getDragPayload: (t, worldX, worldY) => ({ templateKey: t.key, worldX, worldY }),
    getInstancesForGroup: (creatures, template) =>
      creatures.filter((a) => a.templateKey === template.key),
    getInstanceKey:  (a) => a.id,
    getInstanceName: (a) => a.id.slice(0, 8),
    getInstanceBadge: (a) => a.state,
    instanceFields: [
      { key: "state",          label: "État",         options: ["alive", "fighting", "escaping", "dead"] },
      { key: "health",         label: "HP",            min: 0 },
      { key: "respawnDelayMs", label: "Respawn (ms)",  min: 0, step: 1000 },
      { key: "worldX",         label: "WU X",          min: 0 },
      { key: "worldY",         label: "WU Y",          min: 0 },
    ],
    instanceSaveEvent: "admin:update_creature",
    getInstanceSavePayload: (a, fields) => ({ id: a.id, fields }),
    getInstanceTpPosition: (a) => (a.worldX != null && a.worldY != null ? { worldX: a.worldX, worldY: a.worldY } : null),
    instanceDeleteEvent: "admin:delete_creature",
    getInstanceDeletePayload: (a) => ({ id: a.id }),
    getInstanceInfoLine: (a) => {
      const parts: string[] = [];
      if (a.worldX != null && a.worldY != null) {
        const mapPart = a.mapId != null ? `  map:${a.mapId}` : "";
        parts.push(`WU: ${a.worldX}, ${a.worldY}${mapPart}`);
      }
      const respawn = formatRespawnAt(a.respawnAt);
      if (respawn) parts.push(respawn);
      return parts.length ? parts.join("  ·  ") : null;
    },
  },
  {
    id: "resources",
    title: "Resource Editor",
    getGroupKey:  (t) => t.type,
    getGroupName: (t) => t.type,
    groupFields: [
      { key: "textureKey",              label: "Texture",          type: "asset" as const, assetCategory: "sprites" },
      { key: "defaultRemainingLoots",   label: "Loots défaut",     min: 1 },
      { key: "respawnDelayMs",          label: "Respawn (ms)",     min: 1, step: 1000 },
      { key: "gatherCharacterXpReward", label: "XP perso récolte", min: 0 },
      { key: "gatheringDifficulty",     label: "Difficulté (0–100)", min: 0, max: 100 },
    ],
    groupSaveEvent: "admin:update_resource_template",
    getGroupSavePayload: (t, fields) => ({ type: t.type, fields }),
    getGroupInfoLine: (t) => {
      // XP maîtrise estimée (lecture seule) — miroir du Runtime, dérivée de la difficulté.
      const xpLine = gatherMasteryXpLabel(t.type, t.gatheringDifficulty ?? 0);
      const items: string[] = t.lootPoolItems ?? [];
      const lootLine = items.length > 0 ? `Loot pool (lecture seule) : ${items.join(", ")}` : null;
      return lootLine ? `${xpLine}  ·  ${lootLine}` : xpLine;
    },
    dragEvent: "admin:spawn_resource",
    getDragPayload: (t, worldX, worldY) => ({ type: t.type, worldX, worldY }),
    getInstancesForGroup: (resources, tpl) =>
      resources.filter((r) => r.type === tpl.type),
    getInstanceKey:  (r) => r.id,
    getInstanceName: (r) => r.id.slice(0, 8),
    getInstanceBadge: (r) => r.state,
    instanceFields: [
      { key: "state",          label: "État",         options: ["alive", "dead"] },
      { key: "remainingLoots", label: "Loots",        min: 0 },
      { key: "respawnDelayMs", label: "Respawn (ms)", min: 0, step: 1000 },
      { key: "worldX",         label: "WU X",         min: 0 },
      { key: "worldY",         label: "WU Y",         min: 0 },
    ],
    instanceSaveEvent: "admin:update_resource",
    getInstanceSavePayload: (r, fields) => ({ id: r.id, fields }),
    getInstanceTpPosition: (r) => (r.worldX != null && r.worldY != null ? { worldX: r.worldX, worldY: r.worldY } : null),
    instanceDeleteEvent: "admin:delete_resource",
    getInstanceDeletePayload: (r) => ({ id: r.id }),
    getInstanceInfoLine: (r) => {
      const parts: string[] = [];
      if (r.worldX != null && r.worldY != null) {
        const mapPart = r.mapId != null ? `  map:${r.mapId}` : "";
        parts.push(`WU: ${r.worldX}, ${r.worldY}${mapPart}`);
      }
      const respawn = formatRespawnAt(r.respawnAt);
      if (respawn) parts.push(respawn);
      return parts.length ? parts.join("  ·  ") : null;
    },
    instanceActions: [
      {
        label: "Reset template",
        run: (r) => postAdmin(`/admin/resources/${r.id}/reset-from-template`),
      } satisfies InstanceAction,
    ],
  },
  {
    id: "craftingStations",
    title: "Crafting Station Editor",
    getGroupKey:  (t) => t.id,
    getGroupName: (t) => `${t.name} (${t.stationType})`,
    groupFields: [
      { key: "name",                label: "Nom",          type: "text" as const },
      { key: "stationType",         label: "Station",      options: STATION_TYPES },
      { key: "category",            label: "Catégorie",    options: ["smithing", "woodworking", "alchemy", "cooking", "crafting", "general"] },
      { key: "requiredMasteryKey",    label: "Maîtrise requise", options: masteryKeyOptions },
      { key: "interactionRadiusWU", label: "Rayon WU",     min: 1 },
      { key: "textureKey",          label: "Texture",      type: "asset" as const, assetCategory: "buildings" },
      { key: "enabled",             label: "Actif",        options: ["true", "false"] },
    ],
    groupSaveEvent: "admin:update_crafting_station_template",
    getGroupSavePayload: (t, fields) => ({ id: t.id, fields }),
    dragEvent: "admin:create_crafting_station",
    getDragPayload: (t, worldX, worldY) => ({ templateId: t.id, worldX, worldY, mapId: 1 }),
    getInstancesForGroup: (stations, tpl) =>
      stations.filter((s) => s.templateId === tpl.id),
    getInstanceKey:  (s) => s.id,
    getInstanceName: (s) => s.id.slice(0, 8),
    getInstanceBadge: (s) => s.enabled ? "enabled" : "disabled",
    instanceFields: [
      { key: "enabled", label: "Actif", options: ["true", "false"] },
      { key: "worldX",  label: "WU X",  min: 0 },
      { key: "worldY",  label: "WU Y",  min: 0 },
      { key: "mapId",   label: "Map",   min: 1 },
    ],
    instanceSaveEvent: "admin:update_crafting_station",
    getInstanceSavePayload: (s, fields) => ({ id: s.id, fields }),
    getInstanceTpPosition: (s) => (s.worldX != null && s.worldY != null ? { worldX: s.worldX + 256, worldY: s.worldY } : null),
    instanceDeleteEvent: "admin:delete_crafting_station",
    getInstanceDeletePayload: (s) => ({ id: s.id }),
    getInstanceInfoLine: (s) => `WU: ${s.worldX}, ${s.worldY}  ·  map:${s.mapId}`,
  },
  {
    id: "buildings",
    title: "Building Editor",
    getGroupKey:  (t) => t.id,
    getGroupName: (t) => `${t.name} (${t.buildingType})`,
    groupFields: [
      { key: "name",                label: "Nom",          type: "text" as const },
      { key: "textureKey",          label: "Texture",      type: "asset" as const, assetCategory: "buildings" },
      { key: "interactionRadiusWU", label: "Rayon WU",     min: 1 },
      { key: "enabled",             label: "Actif",        options: ["true", "false"] },
    ],
    groupSaveEvent: "admin:update_building_template",
    getGroupSavePayload: (t, fields) => ({ id: t.id, fields }),
    dragEvent: "admin:create_building",
    getDragPayload: (t, worldX, worldY) => ({ templateId: t.id, worldX, worldY, mapId: 1 }),
    getInstancesForGroup: (buildings, tpl) =>
      buildings.filter((b) => b.templateId === tpl.id),
    getInstanceKey:  (b) => b.id,
    getInstanceName: (b) => b.id.slice(0, 8),
    getInstanceBadge: (b) => b.state ?? "ACTIVE",
    instanceFields: [
      { key: "state",  label: "État",  options: BUILDING_STATES },
      { key: "worldX", label: "WU X",  min: 0 },
      { key: "worldY", label: "WU Y",  min: 0 },
      { key: "mapId",  label: "Map",   min: 1 },
    ],
    instanceSaveEvent: "admin:update_building",
    getInstanceSavePayload: (b, fields) => ({ id: b.id, fields }),
    getInstanceTpPosition: (b) => (b.worldX != null && b.worldY != null ? { worldX: b.worldX + 256, worldY: b.worldY } : null),
    instanceDeleteEvent: "admin:delete_building",
    getInstanceDeletePayload: (b) => ({ id: b.id }),
    getInstanceInfoLine: (b) => `WU: ${b.worldX}, ${b.worldY}  ·  map:${b.mapId}  ·  ${b.buildingType}`,
  },
  ];
}

// ── Adapters WOM → formes legacy ──────────────────────────────────────────────

function wosToCreatureInstances(wos: WorldObject[]): any[] {
  return wos.map((wo) => ({
    id: wo.id,
    templateKey: wo.type,
    state: wo.state,
    health: wo.health ?? 0,
    maxHealth: wo.maxHealth ?? 0,
    worldX:          wo.position?.worldX ?? null,
    worldY:          wo.position?.worldY ?? null,
    mapId:           wo.mapId ?? null,
    respawnAt:       wo.metadata.respawnAt ?? null,
    respawnDelayMs:  (wo.metadata.instanceRespawnDelayMs as number | null) ?? 0,
  }));
}

/**
 * Mappe un ResourceTemplate (source : GET /admin/resource-templates) vers la
 * forme attendue par le GroupedSection Resource Editor. La liste vient des
 * TEMPLATES (pas des instances) : un template sans instance dans le monde
 * (ex: grey_rock fraîchement créé) reste visible et éditable.
 */
function mapResourceTemplate(t: any): any {
  const lootPool = Array.isArray(t.lootPool) ? t.lootPool : [];
  return {
    type: t.type,
    textureKey:              t.textureKey ?? 'dead_tree',
    defaultRemainingLoots:   t.defaultRemainingLoots ?? 0,
    respawnDelayMs:          t.respawnDelayMs ?? 0,
    lootPool,                // entrées complètes { itemId, minQty, maxQty, probability }
    lootPoolItems:           lootPool.map((e: any) => e?.itemId).filter(Boolean),
    gatherCharacterXpReward: t.gatherCharacterXpReward ?? 0,
    gatheringDifficulty:     t.gatheringDifficulty ?? 0,
  };
}

type LootRow = { itemId: string; minQty: number; maxQty: number; probability: number };

/**
 * Sélecteur d'item searchable pour le lootPool.
 * - recherche par name / category / type / id (partiel)
 * - liste navigable (catalogue complet quand la recherche est vide, limité à 50)
 * - stocke l'id unique de l'item (évite l'ambiguïté de category)
 * - affiche name · category · objectMode
 */
function LootItemPicker({ items, value, onChange }: {
  items: any[];
  value: string;
  onChange: (itemId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = items.find((it: any) => it.id === value || it.category === value) ?? null;
  const label = (it: any) => `${it.name} · ${it.category} · ${it.objectMode}`;

  const q = query.trim().toLowerCase();
  const filtered = (q === ""
    ? items
    : items.filter((it: any) =>
        [it.name, it.category, it.type, it.id]
          .filter(Boolean)
          .some((f: any) => String(f).toLowerCase().includes(q)),
      )
  ).slice(0, 50);

  return (
    <div className="admin-panel__loot-picker">
      <input
        className="admin-panel__lootpool-item"
        placeholder={selected ? label(selected) : "Rechercher un item…"}
        value={open ? query : (selected ? label(selected) : "")}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        {...kbHandlers}
      />
      {open && (
        <div className="admin-panel__loot-picker-list">
          {filtered.length === 0 && (
            <div className="admin-panel__loot-picker-empty">Aucun item</div>
          )}
          {filtered.map((it: any) => (
            <button
              key={it.id}
              type="button"
              className="admin-panel__loot-picker-opt"
              onMouseDown={(e) => { e.preventDefault(); onChange(it.id); setOpen(false); setQuery(""); }}
            >
              {label(it)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Éditeur lootPool d'un template ressource existant (dans Resource Editor).
 * Sauvegarde via le flux existant admin:update_resource_template.
 * La probabilité est éditée/sauvegardée en 0–1 (compatible backend), label "Chance".
 */
function ResourceLootPoolEditor({ group, items, onSaved, onResult }: {
  group: any;
  items: any[];
  onSaved: (type: string, lootPool: LootRow[]) => void;
  onResult: (msg: string, ok: boolean) => void;
}) {
  const initial = (): LootRow[] =>
    (Array.isArray(group.lootPool) ? group.lootPool : []).map((e: any) => ({
      itemId: String(e?.itemId ?? ""),
      minQty: Number(e?.minQty ?? 1),
      maxQty: Number(e?.maxQty ?? 1),
      probability: Number(e?.probability ?? 1),
    }));
  const [rows, setRows] = useState<LootRow[]>(initial);
  const [saved, setSaved] = useState<LootRow[]>(initial);
  const [saving, setSaving] = useState(false);

  // Resynchronise si on change de template sélectionné.
  useEffect(() => {
    const next = initial();
    setRows(next);
    setSaved(next);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [group.type]);

  // Le bouton n'apparaît que si le loot pool a changé depuis la dernière sauvegarde.
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
  // Une ligne est incomplète/invalide si : pas d'item, minQty<1, maxQty<minQty,
  // ou probability hors [0,1]. Interdit la sauvegarde tant qu'elle existe.
  const hasInvalidRow = rows.some(
    (r) => !r.itemId.trim() || r.minQty < 1 || r.maxQty < r.minQty || r.probability < 0 || r.probability > 1,
  );

  function patchRow(idx: number, patch: Partial<LootRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function save() {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const clean = rows.filter((r) => r.itemId.trim() !== "");
    setSaving(true);
    const result = await ackPromise(socket, "admin:update_resource_template", {
      type: group.type,
      fields: { lootPool: clean },
    });
    setSaving(false);
    onResult(result.message, result.success);
    if (result.success) {
      setRows(clean);
      setSaved(clean);
      onSaved(group.type, clean);
    }
  }

  return (
    <div className="admin-panel__lootpool-editor">
      <div className="admin-panel__lootpool-head">
        <span className="admin-panel__template-stat-label">Loot pool</span>
        <button type="button" className="admin-panel__lootpool-add"
          onClick={() => setRows((prev) => [...prev, { itemId: "", minQty: 1, maxQty: 1, probability: 1 }])}>
          + Ligne
        </button>
      </div>

      {rows.length === 0 ? (
        <span className="admin-panel__field-hint">Aucune entrée (loot vide).</span>
      ) : (
        <div className="admin-panel__lootpool-grid">
          <span className="admin-panel__lootpool-col">Item</span>
          <span className="admin-panel__lootpool-col">Min</span>
          <span className="admin-panel__lootpool-col">Max</span>
          <span className="admin-panel__lootpool-col">Chance (0–1)</span>
          <span className="admin-panel__lootpool-col" />
          {rows.map((entry, idx) => (
            <div key={idx} className="admin-panel__lootpool-row admin-panel__lootpool-row--grid">
              <LootItemPicker items={items} value={entry.itemId} onChange={(id) => patchRow(idx, { itemId: id })} />
              <input className="admin-panel__template-stat-input admin-panel__lootpool-num" type="number" min={1}
                value={entry.minQty} onChange={(e) => patchRow(idx, { minQty: Number(e.target.value) })} />
              <input className="admin-panel__template-stat-input admin-panel__lootpool-num" type="number" min={1}
                value={entry.maxQty} onChange={(e) => patchRow(idx, { maxQty: Number(e.target.value) })} />
              <input className="admin-panel__template-stat-input admin-panel__lootpool-num" type="number" min={0} max={1} step={0.05}
                value={entry.probability} onChange={(e) => patchRow(idx, { probability: Number(e.target.value) })} />
              <button type="button" className="admin-panel__lootpool-remove"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}>✕</button>
            </div>
          ))}
        </div>
      )}

      {dirty && (
        <>
          {hasInvalidRow && (
            <span className="admin-panel__field-hint">
              Ligne incomplète : choisir un item, min ≥ 1, max ≥ min, chance 0–1.
            </span>
          )}
          <button type="button" className="admin-panel__apply-btn" disabled={saving || hasInvalidRow} onClick={() => void save()}>
            {saving ? "…" : "Save"}
          </button>
        </>
      )}
    </div>
  );
}

function wosToResourceInstances(wos: WorldObject[]): any[] {
  return wos.map((wo) => ({
    id: wo.id,
    type: wo.type,
    state: wo.state,
    remainingLoots: wo.remainingLoots ?? 0,
    worldX:         wo.position?.worldX ?? null,
    worldY:         wo.position?.worldY ?? null,
    mapId:          wo.mapId ?? null,
    respawnAt:      wo.metadata.respawnAt ?? null,
    respawnDelayMs: (wo.metadata.instanceRespawnDelayMs as number | null) ?? 0,
  }));
}

function wosToCraftingStationTemplates(wos: WorldObject[]): any[] {
  return wos.map((wo) => ({
    id: wo.id,
    key: wo.type,
    name: (wo.metadata.name as string) ?? wo.type,
    stationType: (wo.metadata.stationType as string) ?? wo.type,
    category: (wo.metadata.category as string) ?? "crafting",
    requiredMasteryKey: (wo.metadata.requiredMasteryKey as string | null) ?? "",
    interactionRadiusWU: (wo.metadata.interactionRadiusWU as number) ?? 1536,
    textureKey: (wo.metadata.textureKey as string | null) ?? "",
    enabled: wo.state === "enabled",
  }));
}

function stationToInstance(station: any): any {
  return {
    id: station.id,
    templateId: station.templateId ?? station.template?.id,
    templateKey: station.template?.key ?? station.templateKey ?? "",
    stationType: station.template?.stationType ?? station.stationType ?? "",
    mapId: station.mapId ?? 1,
    worldX: station.worldX,
    worldY: station.worldY,
    enabled: Boolean(station.enabled),
  };
}

function wosToCraftingStationInstances(wos: WorldObject[]): any[] {
  return wos.map((wo) => ({
    id: wo.id,
    templateId: (wo.metadata.templateId as string) ?? "",
    templateKey: (wo.metadata.templateKey as string) ?? wo.type,
    stationType: (wo.metadata.stationType as string) ?? "",
    mapId: wo.mapId ?? 1,
    worldX: wo.position?.worldX ?? 0,
    worldY: wo.position?.worldY ?? 0,
    enabled: wo.state === "enabled",
  }));
}

function wosToBuildingTemplates(wos: WorldObject[]): any[] {
  return wos.map((wo) => ({
    id: wo.id,
    key: (wo.metadata.key as string) ?? wo.type,
    name: (wo.metadata.name as string) ?? wo.type,
    buildingType: (wo.metadata.buildingType as string) ?? wo.type,
    textureKey: (wo.metadata.textureKey as string | null) ?? null,
    interactionRadiusWU: (wo.metadata.interactionRadiusWU as number) ?? 1536,
    enabled: wo.state === "enabled",
  }));
}

function wosToBuildingInstances(wos: WorldObject[]): any[] {
  return wos.map((wo) => ({
    id: wo.id,
    templateId: (wo.metadata.templateId as string) ?? "",
    templateKey: (wo.metadata.templateKey as string) ?? wo.type,
    buildingType: (wo.metadata.buildingType as string) ?? wo.type,
    name: (wo.metadata.name as string) ?? "",
    mapId: wo.mapId ?? 1,
    worldX: wo.position?.worldX ?? 0,
    worldY: wo.position?.worldY ?? 0,
    state: wo.state ?? "ACTIVE",
  }));
}

function formatRespawnAt(raw: string | Date | null | undefined): string | null {
  if (raw == null) return null;
  const d = typeof raw === "string" ? new Date(raw) : raw;
  if (isNaN(d.getTime())) return null;
  const now = Date.now();
  const diffMs = d.getTime() - now;
  if (diffMs <= 0) return "respawn imminent";
  const secs = Math.round(diffMs / 1000);
  if (secs < 60) return `respawn dans ${secs}s`;
  return `respawn dans ${Math.round(secs / 60)}min`;
}

// ── AdminPanelWOM ─────────────────────────────────────────────────────────────

const NEW_CREATURE_DEFAULT = { key: "", name: "", textureKey: "turkey", baseHealth: 30, baseAttack: 3, baseArmor: 0, aggroRadius: 0, fleeThresholdPct: 0, respawnDelayMs: 20000 };
const NEW_RESOURCE_TEMPLATE_DEFAULT = { type: "", textureKey: "dead_tree", defaultRemainingLoots: 4, respawnDelayMs: 30000, gatherCharacterXpReward: 0, gatheringDifficulty: 0, lootPool: [] as Array<{ itemId: string; minQty: number; maxQty: number; probability: number }> };
const NEW_STATION_TEMPLATE_DEFAULT = {
  key: "",
  name: "",
  stationType: "forge",
  category: "smithing",
  requiredMasteryKey: "",
  interactionRadiusWU: 1536,
  textureKey: "",
  enabled: true,
};

const NEW_BUILDING_TEMPLATE_DEFAULT = {
  key: "",
  name: "",
  buildingType: "auction_house",
  textureKey: "",
  interactionRadiusWU: 1536,
  enabled: true,
};

const EMPTY_MOVEMENT_METRICS: MovementMetrics = {
  totalMoves: 0,
  suspectTeleports: 0,
  suspectSpeed: 0,
  invalidCoordinates: 0,
  mapMismatch: 0,
};

// ── PlayerWalletPanel — monnaie intégrée dans l'inspecteur joueur ────────────

function PlayerWalletPanel({ characterId, onResult }: { characterId: string; onResult: (text: string, ok: boolean) => void }) {
  const [gold, setGold] = useState(0);
  const [silver, setSilver] = useState(0);
  const [bronze, setBronze] = useState(0);
  const [initial, setInitial] = useState({ gold: 0, silver: 0, bronze: 0 });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  async function fetchBalance() {
    const socket = getSocket();
    if (!socket?.connected) return;
    setFetching(true);
    const res = await ackPromise(socket, "admin:get_wallet", { characterId });
    setFetching(false);
    if (res.success) {
      const g = (res as any).gold ?? 0;
      const s = (res as any).silver ?? 0;
      const b = (res as any).bronze ?? 0;
      setGold(g);
      setSilver(s);
      setBronze(b);
      setInitial({ gold: g, silver: s, bronze: b });
    }
  }

  useEffect(() => { fetchBalance(); }, [characterId]);

  async function save() {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const g = Math.floor(gold);
    const s = Math.floor(silver);
    const b = Math.floor(bronze);
    if (g < 0 || s < 0 || b < 0) { onResult("Les valeurs doivent être positives ou nulles.", false); return; }
    setLoading(true);
    const result = await ackPromise(socket, "admin:add_balance", { characterId, gold: g, silver: s, bronze: b, direction: "set" });
    setLoading(false);
    onResult(result.message, result.success);
    if (result.success) await fetchBalance();
  }

  const busy = loading || fetching;
  const walletDirty = gold !== initial.gold || silver !== initial.silver || bronze !== initial.bronze;

  return (
    <div className="admin-panel__player-wallet">
      <span className="admin-panel__subsection-label">Monnaie{fetching ? " …" : ""}</span>
      <div className="admin-panel__template-stats">
        <label className="admin-panel__template-stat">
          <span className="admin-panel__template-stat-label">Or</span>
          <input className="admin-panel__template-stat-input" type="number" min={0} step={1}
            value={gold} onChange={(e) => setGold(Number(e.target.value))} disabled={busy} {...kbHandlers} />
        </label>
        <label className="admin-panel__template-stat">
          <span className="admin-panel__template-stat-label">Argent</span>
          <input className="admin-panel__template-stat-input" type="number" min={0} step={1}
            value={silver} onChange={(e) => setSilver(Number(e.target.value))} disabled={busy} {...kbHandlers} />
        </label>
        <label className="admin-panel__template-stat">
          <span className="admin-panel__template-stat-label">Bronze</span>
          <input className="admin-panel__template-stat-input" type="number" min={0} step={1}
            value={bronze} onChange={(e) => setBronze(Number(e.target.value))} disabled={busy} {...kbHandlers} />
        </label>
      </div>
      {walletDirty && (
        <div className="admin-panel__button-row">
          <button className="admin-panel__apply-btn" disabled={busy} onClick={save}>{loading ? "…" : "Save"}</button>
        </div>
      )}
    </div>
  );
}

// ── PlayerDebugRuntimePanel — runtime stats + modifiers dans l'inspecteur ────

function PlayerDebugRuntimePanel() {
  return (
    <div className="admin-panel__debug-runtime">
      <span className="admin-panel__subsection-label">Debug runtime</span>
      <RuntimeStatsPanel />
      <RuntimeInspectorPanel />
    </div>
  );
}

// ── PlayerInventoryPanel — injection d'objets depuis le catalogue ─────────────

type CatalogItem = {
  id: string;
  name: string;
  category: string;
  type: string;
  objectMode: "STACKABLE" | "INSTANCE";
  slot?: string | null;
};

function PlayerInventoryPanel({
  characterId,
  items,
  onResult,
}: {
  characterId: string;
  items: CatalogItem[];
  onResult: (text: string, ok: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q) ||
        it.type.toLowerCase().includes(q),
    );
  }, [items, search]);

  function selectItem(item: CatalogItem) {
    setSelected(item);
    setQuantity(1);
    setSearch("");
  }

  function clearSelection() {
    setSelected(null);
    setSearch("");
  }

  async function giveItem() {
    if (!selected) return;
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const qty = selected.objectMode === "STACKABLE" ? Math.max(1, Math.floor(quantity)) : 1;
    setLoading(true);
    const result = await ackPromise(socket, "admin:give_item", {
      characterId,
      itemId: selected.id,
      quantity: qty,
    });
    setLoading(false);
    onResult(result.message, result.success);
    if (result.success) clearSelection();
  }

  return (
    <div className="admin-panel__player-inventory">
      <span className="admin-panel__subsection-label">Inventaire — Ajouter un objet</span>
      <span className="admin-panel__player-info-hint">Rechercher par nom, catégorie, mode ou slot.</span>
      {!selected && (
        <input
          className="admin-panel__search"
          type="text"
          placeholder="Ex : sword, wood, STACKABLE, right-hand…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          {...kbHandlers}
          spellCheck={false}
        />
      )}
      {!selected && search && (
        <div className="admin-panel__item-catalog">
          {filtered.length === 0 && <p className="admin-panel__loading">Aucun résultat.</p>}
          {filtered.slice(0, 12).map((it) => (
            <button key={it.id} className="admin-panel__catalog-entry" onClick={() => selectItem(it)}>
              <span className="admin-panel__catalog-name">{it.name}</span>
              <span className="admin-panel__catalog-meta">{it.category} · {it.objectMode}{it.slot ? ` · ${it.slot}` : ""}</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="admin-panel__give-form">
          <div className="admin-panel__give-item-info">
            <span className="admin-panel__give-item-name">{selected.name}</span>
            <span className="admin-panel__give-item-meta">
              {selected.category} · {selected.type} · {selected.objectMode}
              {selected.slot ? ` · slot: ${selected.slot}` : ""}
            </span>
            <button className="admin-panel__catalog-clear" onClick={clearSelection} title="Changer d'objet">✕</button>
          </div>
          {selected.objectMode === "STACKABLE" && (
            <label className="admin-panel__template-stat">
              <span className="admin-panel__template-stat-label">Quantité</span>
              <input
                className="admin-panel__template-stat-input"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                {...kbHandlers}
              />
            </label>
          )}
          <button className="admin-panel__apply-btn" disabled={loading} onClick={giveItem}>
            {loading ? "…" : "Donner"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── PlayerSection — inspecteur joueurs ────────────────────────────────────────

function PlayerSection({
  players,
  items,
  onResult,
  onPlayerRowUpdated,
}: {
  players: any[];
  items: CatalogItem[];
  onResult: (text: string, ok: boolean) => void;
  onPlayerRowUpdated: (row: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Set toujours synchronisé avec `expanded`, lu depuis le listener socket
  // (évite une closure figée sur `expanded` dans l'effet monté une seule fois).
  const expandedRef = useRef<Set<string>>(new Set());
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  // Refresh CIBLÉ d'un seul joueur (GET /admin/characters/:id — pas la liste
  // complète). Appelé à l'ouverture d'une ligne et sur événement dirty pour
  // un joueur déjà ouvert uniquement — évite la surcharge à l'échelle de
  // centaines de joueurs connectés.
  const refreshPlayerRow = useCallback((id: string) => {
    const token = localStorage.getItem("token") ?? "";
    if (!token) return;
    fetchAdmin<any>(`/admin/characters/${id}`, token)
      .then(onPlayerRowUpdated)
      .catch(() => {});
  }, [onPlayerRowUpdated]);

  function togglePlayer(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      const opening = !next.has(id);
      if (opening) next.add(id); else next.delete(id);
      return next;
    });
    // À l'ouverture : garantir des données fraîches (le joueur a pu changer
    // pendant qu'il était replié, sans qu'aucun refetch n'ait eu lieu).
    if (!expanded.has(id)) refreshPlayerRow(id);
  }

  // Écoute le signal existant `admin:character_details_dirty` (aucun nouvel
  // événement) ; ne déclenche un refresh que pour un joueur DÉJÀ OUVERT — les
  // lignes repliées ne sont jamais refetchées en arrière-plan.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const onDirty = (event: { characterId?: string }) => {
      const id = event?.characterId;
      if (!id || !expandedRef.current.has(id)) return;
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      timers.set(id, setTimeout(() => {
        timers.delete(id);
        refreshPlayerRow(id);
      }, 200));
    };
    socket.on("admin:character_details_dirty", onDirty);
    return () => {
      socket.off("admin:character_details_dirty", onDirty);
      timers.forEach(clearTimeout);
    };
  }, [refreshPlayerRow]);

  const filtered = players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const pag = usePagination(filtered.length);
  const paginated = filtered.slice((pag.page - 1) * ITEMS_PER_PAGE, pag.page * ITEMS_PER_PAGE);

  useEffect(() => { pag.goToPage(1); }, [search]);

  const draft = useDraft(PLAYER_EDITABLE_FIELDS);

  async function onTp(player: any) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const characterId = getAdminCharacterId();
    if (!characterId) { onResult("Personnage introuvable.", false); return; }
    const result = await ackPromise(socket, "admin:teleport", { characterId, targetCharacterId: player.id });
    onResult(result.message, result.success);
  }

  async function onApply(player: any) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const dk = player.id as string;
    const dirtyFields = draft.collectDirty(dk, player);
    if (!Object.keys(dirtyFields).length) return;
    draft.setSaving((prev) => ({ ...prev, [dk]: true }));
    const result = await ackPromise(socket, "admin:update_character", { id: player.id, fields: dirtyFields });
    draft.setSaving((prev) => ({ ...prev, [dk]: false }));
    onResult(result.message, result.success);
    if (result.success) {
      Object.assign(player, dirtyFields);
      // Rafraîchit les stats dérivées (calculées serveur) si renvoyées.
      const serverStats = (result as any).data?.stats;
      if (serverStats) player.stats = serverStats;
      draft.clearDraft(dk);
    }
  }

  return (
    <section className="admin-panel__section">
      <div className="admin-panel__section-header" onClick={() => setIsOpen((o) => !o)}>
        <AdminSectionTitle title="Joueurs" icon="👤" />
        {isOpen && <PaginationControls {...pag} />}
        <span className="admin-panel__section-chevron">{isOpen ? "▼" : "▶"}</span>
      </div>

      {isOpen && (
        <>
          <input className="admin-panel__search" type="text"
            placeholder="Filtrer joueurs…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()} {...kbHandlers} spellCheck={false} />

          {players.length === 0 && <p className="admin-panel__loading">Chargement…</p>}
          {players.length > 0 && filtered.length === 0 && <p className="admin-panel__loading">Aucun résultat.</p>}

          <div className="admin-panel__template-list">
            {paginated.map((player) => {
              const dk = player.id as string;
              const hasPosition = player.worldX != null && player.worldY != null;
              const isExpanded = expanded.has(dk);
              return (
                <div key={dk} className="admin-panel__template-item">

                  {/* ── En-tête joueur (cliquable pour déplier) ── */}
                  <div
                    className="admin-panel__item-header admin-panel__item-header--clickable"
                    onClick={() => togglePlayer(dk)}
                  >
                    <span className="admin-panel__drag-handle" title="Glisser sur la map"
                      onMouseDown={(e) => { e.stopPropagation(); startDrag(e, player.name, (worldX, worldY) => {
                        const socket = getSocket();
                        if (!socket?.connected) return;
                        ackPromise(socket, "admin:teleport", { characterId: player.id, worldX: Math.round(worldX), worldY: Math.round(worldY) })
                          .then((r) => onResult(r.message, r.success));
                      }); }}>⠿</span>
                    <span className="admin-panel__section-chevron">{isExpanded ? "▼" : "▶"}</span>
                    <span className="admin-panel__template-name">{player.name}</span>
                    {hasPosition && (
                      <button className="admin-panel__tp-btn"
                        title={`Tp WU (${player.worldX}, ${player.worldY})`}
                        onClick={(e) => { e.stopPropagation(); onTp(player); }}>↓ Tp</button>
                    )}
                  </div>

                  {isExpanded && (
                    <>
                      {/* ── Informations ── */}
                      <span className="admin-panel__subsection-label">Informations</span>
                      <div className="admin-panel__player-info-row">
                        <span className="admin-panel__player-info-key">Niveau</span>
                        <span className="admin-panel__player-info-val">{player.level ?? "—"}</span>
                        <span className="admin-panel__player-info-key">HP</span>
                        <span className="admin-panel__player-info-val">{player.health ?? "—"} / {player.maxHealth ?? "—"}</span>
                      </div>

                      {/* ── Position ── */}
                      {hasPosition && (
                        <>
                          <span className="admin-panel__subsection-label">Position</span>
                          <div className="admin-panel__player-info-row">
                            <span className="admin-panel__player-info-key">WU X</span>
                            <span className="admin-panel__player-info-val">{player.worldX}</span>
                            <span className="admin-panel__player-info-key">WU Y</span>
                            <span className="admin-panel__player-info-val">{player.worldY}</span>
                            {player.mapId != null && <>
                              <span className="admin-panel__player-info-key">Map</span>
                              <span className="admin-panel__player-info-val">{player.mapId}</span>
                            </>}
                          </div>
                        </>
                      )}

                      {/* ── A. Progression (éditable) ── */}
                      <span className="admin-panel__subsection-label">Progression</span>
                      <div className="admin-panel__template-stats">
                        {PLAYER_PROGRESSION_FIELDS.map((f) => (
                          <label key={f.key} className="admin-panel__template-stat">
                            <span className="admin-panel__template-stat-label">{f.label}</span>
                            <StatField def={f} dirty={draft.isDirty(dk, f.key, player)}
                              value={draft.getDisplayField(dk, f.key, player)}
                              onChange={(v) => draft.onChange(dk, f.key, v)} />
                          </label>
                        ))}
                      </div>

                      {/* ── B. Stats principales (éditable) ── */}
                      <span className="admin-panel__subsection-label">Stats principales</span>
                      <div className="admin-panel__template-stats">
                        {PLAYER_PRIMARY_STAT_FIELDS.map((f) => (
                          <label key={f.key} className="admin-panel__template-stat">
                            <span className="admin-panel__template-stat-label">{f.label}</span>
                            <StatField def={f} dirty={draft.isDirty(dk, f.key, player)}
                              value={draft.getDisplayField(dk, f.key, player)}
                              onChange={(v) => draft.onChange(dk, f.key, v)} />
                          </label>
                        ))}
                      </div>

                      {/* ── B-bis. Legacy (éditable, reset/debug manuel) ── */}
                      <span className="admin-panel__subsection-label">Legacy</span>
                      <div className="admin-panel__template-stats">
                        {PLAYER_LEGACY_FIELDS.map((f) => (
                          <label key={f.key} className="admin-panel__template-stat">
                            <span className="admin-panel__template-stat-label">{f.label}</span>
                            <StatField def={f} dirty={draft.isDirty(dk, f.key, player)}
                              value={draft.getDisplayField(dk, f.key, player)}
                              onChange={(v) => draft.onChange(dk, f.key, v)} />
                          </label>
                        ))}
                      </div>

                      {/* ── C. Combat brut / debug (éditable) ── */}
                      <span className="admin-panel__subsection-label">Combat brut / debug</span>
                      <div className="admin-panel__template-stats">
                        {PLAYER_COMBAT_FIELDS.map((f) => (
                          <label key={f.key} className="admin-panel__template-stat">
                            <span className="admin-panel__template-stat-label">{f.label}</span>
                            <StatField def={f} dirty={draft.isDirty(dk, f.key, player)}
                              value={draft.getDisplayField(dk, f.key, player)}
                              onChange={(v) => draft.onChange(dk, f.key, v)} />
                          </label>
                        ))}
                      </div>

                      {draft.hasAnyDirty(dk, player) && (
                        <button className="admin-panel__apply-btn"
                          disabled={!!draft.saving[dk]} onClick={() => onApply(player)}>
                          {draft.saving[dk] ? "…" : "Save"}
                        </button>
                      )}

                      {/* ── D. Stats dérivées (lecture seule, calculées serveur) ── */}
                      <span className="admin-panel__subsection-label">Stats dérivées (serveur)</span>
                      <div className="admin-panel__player-derived">
                        {PLAYER_DERIVED_ROWS.map((r) => (
                          <span key={r.key} className="admin-panel__player-derived-cell">
                            <span className="admin-panel__player-info-key">{r.label}</span>
                            <span className="admin-panel__player-info-val">
                              {formatDerived(player.stats?.derived?.[r.key], r.suffix)}
                            </span>
                          </span>
                        ))}
                      </div>

                      {/* ── Monnaie ── */}
                      <PlayerWalletPanel characterId={dk} onResult={onResult} />

                      {/* ── Inventaire ── */}
                      <PlayerInventoryPanel characterId={dk} items={items} onResult={onResult} />

                      {/* ── Miroir personnage read-only (Phase 1bis-A) ── */}
                      <AdminCharacterPanel characterId={dk} />

                      {/* ── Debug runtime ── */}
                      <PlayerDebugRuntimePanel />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export default function AdminPanelWOM() {
  const token = localStorage.getItem("token") ?? "";
  const selectedWO = useDevToolsStore((s) => s.selectedWorldObject);
  const highlightIds: Record<string, string | null> = {
    creatures: selectedWO?.category === "creature"   ? selectedWO.id : null,
    resources: selectedWO?.category === "resource" ? selectedWO.id : null,
    craftingStations: selectedWO?.category === "crafting_station" ? selectedWO.id : null,
    buildings: selectedWO?.category === "building" ? selectedWO.id : null,
  };
  const [overview,     setOverview]     = useState<Overview | null>(null);
  const [sectionData,  setSectionData]  = useState<Record<string, any[]>>({});

  // Patch cible d'UNE ligne "players" (pas de refetch de la liste complete) —
  // passe a PlayerSection, qui l'appelle uniquement pour le joueur
  // selectionne/ouvert (evite la surcharge a l'echelle de centaines de
  // joueurs). Reutilise le patron immuable deja utilise pour sectionData.
  const patchPlayerRow = useCallback((row: any) => {
    setSectionData((prev) => {
      const players = prev.players ?? [];
      const idx = players.findIndex((p: any) => p.id === row.id);
      if (idx === -1) return prev;
      const next = players.slice();
      next[idx] = row;
      return { ...prev, players: next };
    });
  }, []);
  const [groupData,    setGroupData]    = useState<Record<string, any[]>>({});
  const [instanceData, setInstanceData] = useState<Record<string, any[]>>({});
  const [error,   setError]   = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [results, setResults] = useState<ConsoleLine[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [createCreatureOpen, setCreateCreatureOpen] = useState(false);
  const [newCreature, setNewCreature] = useState({ ...NEW_CREATURE_DEFAULT });
  const [createResourceTemplateOpen, setCreateResourceTemplateOpen] = useState(false);
  const [newResourceTemplate, setNewResourceTemplate] = useState({ ...NEW_RESOURCE_TEMPLATE_DEFAULT });
  const [newStationTemplateOpen, setNewStationTemplateOpen] = useState(false);
  const [newStationTemplate, setNewStationTemplate] = useState({ ...NEW_STATION_TEMPLATE_DEFAULT });
  const [newBuildingTemplateOpen, setNewBuildingTemplateOpen] = useState(false);
  const [newBuildingTemplate, setNewBuildingTemplate] = useState({ ...NEW_BUILDING_TEMPLATE_DEFAULT });
  const [creating, setCreating] = useState(false);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [movementMetrics, setMovementMetrics] = useState<MovementMetrics | null>(null);
  const [movementMetricsLoading, setMovementMetricsLoading] = useState(false);

  const groupedConfigs = useMemo(
    () => buildGroupedSectionConfigs((sectionData["masteries"] ?? []).map((sd: any) => sd.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionData["masteries"]],
  );

  useEffect(() => {
    const fetches: Promise<any>[] = [
      // Overview et joueurs : REST identique au legacy
      fetchAdmin<Overview>("/admin/overview", token).then(setOverview),
      fetchAdmin<any[]>("/admin/characters", token).then((data) =>
        setSectionData((prev) => ({ ...prev, players: data }))
      ),
      // Créatures : templates via REST, instances via WOM
      fetchAdmin<any[]>("/admin/templates", token).then((data) =>
        setGroupData((prev) => ({ ...prev, creatures: data }))
      ),
      fetchAdmin<WorldObject[]>("/admin/creatures/world-objects", token).then((wos) =>
        setInstanceData((prev) => ({ ...prev, creatures: wosToCreatureInstances(wos) }))
      ),
      // Resource Editor : liste depuis les TEMPLATES (source de vérité),
      // instances depuis le WOM (pour le détail par groupe).
      fetchAdmin<any[]>("/admin/resource-templates", token).then((templates) =>
        setGroupData((prev) => ({ ...prev, resources: templates.map(mapResourceTemplate) }))
      ),
      fetchAdmin<WorldObject[]>("/admin/resources/world-objects", token).then((wos) =>
        setInstanceData((prev) => ({ ...prev, resources: wosToResourceInstances(wos) }))
      ),
      fetchAdmin<WorldObject[]>("/admin/crafting-station-templates/world-objects", token).then((wos) =>
        setGroupData((prev) => ({ ...prev, craftingStations: wosToCraftingStationTemplates(wos) }))
      ),
      fetchAdmin<WorldObject[]>("/admin/crafting-stations/world-objects", token).then((wos) =>
        setInstanceData((prev) => ({ ...prev, craftingStations: wosToCraftingStationInstances(wos) }))
      ),
      fetchAdmin<WorldObject[]>("/admin/building-templates/world-objects", token).then((wos) =>
        setGroupData((prev) => ({ ...prev, buildings: wosToBuildingTemplates(wos) }))
      ),
      fetchAdmin<WorldObject[]>("/admin/buildings/world-objects", token).then((wos) =>
        setInstanceData((prev) => ({ ...prev, buildings: wosToBuildingInstances(wos) }))
      ),
      // Masteries : liste via REST
      fetchAdmin<any[]>("/admin/mastery-definitions", token).then((data) =>
        setSectionData((prev) => ({ ...prev, masteries: data }))
      ),
      // Items : pour les sélecteurs ingrédients/résultats
      fetchAdmin<any[]>("/admin/items", token).then(setItems),
      // Recettes crafting
      fetchAdmin<any[]>("/admin/crafting-recipes", token).then(setRecipes),
      fetchAdmin<MovementMetrics>("/admin/movement-metrics", token).then(setMovementMetrics),
    ];
    Promise.all(fetches).catch(() => setError("Impossible de charger les données admin."));
  }, [token]);

  useEffect(() => {
    function onItemsChanged() {
      if (!token) return;
      fetchAdmin<any[]>("/admin/items", token).then(setItems).catch(() => {});
    }
    window.addEventListener("devtools:items-changed", onItemsChanged);
    return () => window.removeEventListener("devtools:items-changed", onItemsChanged);
  }, [token]);

  const overviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleOverviewRefresh() {
    if (overviewTimer.current) clearTimeout(overviewTimer.current);
    overviewTimer.current = setTimeout(() => {
      fetchAdmin<Overview>("/admin/overview", token).then(setOverview).catch(() => {});
    }, 600);
  }

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onCreatureUpdate(dto: any) {
      setInstanceData((prev) => {
        const list: any[] = prev.creatures ?? [];
        const idx = list.findIndex((a) => a.id === dto.id);
        if (idx >= 0) {
          const next = [...list]; next[idx] = { ...next[idx], ...dto };
          return { ...prev, creatures: next };
        }
        if (dto.state === 'dead') return prev;
        scheduleOverviewRefresh();
        return { ...prev, creatures: [...list, { ...dto, templateKey: dto.templateKey ?? "" }] };
      });
    }

    function onResourceUpdate(data: any) {
      setInstanceData((prev) => {
        const list: any[] = prev.resources ?? [];
        if (data.deleted) return { ...prev, resources: list.filter((r) => r.id !== data.id) };
        const idx = list.findIndex((r) => r.id === data.id);
        if (idx >= 0) {
          const next = [...list]; next[idx] = { ...next[idx], ...data };
          return { ...prev, resources: next };
        }
        if (data.worldX == null || data.state === 'dead') return prev;
        return { ...prev, resources: [...list, data] };
      });
    }

    function onCraftingStationUpdate(data: any) {
      setInstanceData((prev) => {
        const list: any[] = prev.craftingStations ?? [];
        if (data.deleted) return { ...prev, craftingStations: list.filter((s) => s.id !== data.id) };
        const nextStation = stationToInstance(data);
        const idx = list.findIndex((s) => s.id === data.id);
        if (idx >= 0) {
          const next = [...list]; next[idx] = { ...next[idx], ...nextStation };
          return { ...prev, craftingStations: next };
        }
        return { ...prev, craftingStations: [...list, nextStation] };
      });
    }

    function onPlayerJoined() { setOverview((prev) => prev ? { ...prev, connectedPlayers: prev.connectedPlayers + 1 } : prev); }
    function onPlayerLeft()   { setOverview((prev) => prev ? { ...prev, connectedPlayers: Math.max(0, prev.connectedPlayers - 1) } : prev); }

    function onBuildingUpdate(data: any) {
      setInstanceData((prev) => {
        const list: any[] = prev.buildings ?? [];
        if (data.deleted) return { ...prev, buildings: list.filter((b) => b.id !== data.id) };
        const instance = {
          id: data.id,
          templateId: data.metadata?.templateId ?? data.templateId ?? "",
          templateKey: data.metadata?.templateKey ?? data.type ?? "",
          buildingType: data.metadata?.buildingType ?? data.type ?? "",
          name: data.metadata?.name ?? "",
          mapId: data.mapId ?? 1,
          worldX: data.position?.worldX ?? data.worldX ?? 0,
          worldY: data.position?.worldY ?? data.worldY ?? 0,
          state: data.state ?? "ACTIVE",
        };
        const idx = list.findIndex((b) => b.id === data.id);
        if (idx >= 0) {
          const next = [...list]; next[idx] = { ...next[idx], ...instance };
          return { ...prev, buildings: next };
        }
        return { ...prev, buildings: [...list, instance] };
      });
    }

    socket.on('creature_update', onCreatureUpdate);
    socket.on('resource_update', onResourceUpdate);
    socket.on('crafting_station_update', onCraftingStationUpdate);
    socket.on('building_update', onBuildingUpdate);
    socket.on('player_joined', onPlayerJoined);
    socket.on('player_left', onPlayerLeft);
    return () => {
      socket.off('creature_update', onCreatureUpdate);
      socket.off('resource_update', onResourceUpdate);
      socket.off('crafting_station_update', onCraftingStationUpdate);
      socket.off('building_update', onBuildingUpdate);
      socket.off('player_joined', onPlayerJoined);
      socket.off('player_left', onPlayerLeft);
      if (overviewTimer.current) clearTimeout(overviewTimer.current);
    };
  }, [token]);

  function handleInstanceDeleted(sectionId: string, instanceKey: string) {
    setInstanceData((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] ?? []).filter((i) => {
        const cfg = groupedConfigs.find((c) => c.id === sectionId);
        return cfg ? cfg.getInstanceKey(i) !== instanceKey : true;
      }),
    }));
  }

  function pushResult(text: string, ok: boolean) {
    setResults((prev) => [{ text, ok }, ...prev].slice(0, 5));
  }

  async function refreshMovementMetrics() {
    setMovementMetricsLoading(true);
    try {
      const metrics = await fetchAdmin<MovementMetrics>("/admin/movement-metrics", token);
      setMovementMetrics(metrics);
      pushResult("Movement metrics rafraîchies.", true);
    } catch {
      pushResult("Impossible de charger les movement metrics.", false);
    } finally {
      setMovementMetricsLoading(false);
    }
  }

  async function resetMovementMetrics() {
    setMovementMetricsLoading(true);
    try {
      const res = await fetch(`${API}/admin/movement-metrics/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        pushResult((body as any).message ?? `Erreur ${res.status}`, false);
        return;
      }
      setMovementMetrics(((body as any).metrics ?? EMPTY_MOVEMENT_METRICS) as MovementMetrics);
      pushResult("Movement metrics remises à zéro.", true);
    } catch {
      pushResult("Impossible de reset les movement metrics.", false);
    } finally {
      setMovementMetricsLoading(false);
    }
  }

  async function runCommand(raw: string) {
    const parsed = parseCommand(raw.trim());
    if (!parsed) { pushResult("Syntaxe invalide — commencez par '/'.", false); return; }
    const def = commandRegistry[parsed.name];
    if (!def) {
      const matches = autocompleteCommand(parsed.name);
      const hint = matches.length ? ` Vouliez-vous dire : ${matches.join(", ")} ?` : "";
      pushResult(`Commande "${parsed.name}" inconnue.${hint}`, false);
      return;
    }
    if (def.destructive && parsed.flags["confirm"] !== "true") {
      pushResult("Commande destructive — ajoutez --confirm pour l'exécuter.", false); return;
    }
    const socket = getSocket();
    if (!socket?.connected) { pushResult("Erreur : socket non connecté.", false); return; }
    const ctx = {
      socket, token,
      getTarget: () => null,
      getLastClickedWorldPoint: () => getDevToolsStore().getState().lastClickedWorldPoint,
      getTemplateKeys: () => (groupData["creatures"] ?? []).map((t: any) => t.key),
    };
    const result = await def.handler(parsed.args, parsed.flags, ctx);
    pushResult(result.message, result.success);
    getDevToolsStore().getState().addToHistory(raw.trim());
  }

  async function onConsoleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = command.trim();
      if (!cmd) return;
      setCommand("");
      await runCommand(cmd);
      return;
    }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCommand(getDevToolsStore().getState().navigateHistory("up",   command)); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCommand(getDevToolsStore().getState().navigateHistory("down", command)); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      const parts = command.split(/\s+/);
      if (parts.length === 1 && parts[0].startsWith("/")) {
        const suggestions = autocompleteCommand(parts[0].slice(1));
        if (suggestions.length === 1) setCommand(suggestions[0] + " ");
        else if (suggestions.length > 1) pushResult(`Suggestions : ${suggestions.join("  ")}`, true);
      }
    }
  }

  return (
    <div className="admin-panel">
      <div className="admin-panel__command">
        <span className="admin-panel__command-prefix">&gt;</span>
        <input
          ref={inputRef}
          className="admin-panel__command-input"
          type="text"
          placeholder="/spawn goblin 300 400  /help"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onConsoleKeyDown}
          {...kbHandlers}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {results.length > 0 && (
        <div className="admin-panel__results">
          {results.map((r, i) => (
            <div key={i} className={`admin-panel__result admin-panel__result--${r.ok ? "ok" : "err"}`}>{r.text}</div>
          ))}
        </div>
      )}

      {error && <p className="admin-panel__error">{error}</p>}

      {overview && (
        <section className="admin-panel__section">
          <div className="admin-panel__section-header" onClick={() => setOverviewOpen((o) => !o)}>
            <AdminSectionTitle title="Vue d'ensemble" icon="📊" />
            <span className="admin-panel__section-chevron">{overviewOpen ? "▼" : "▶"}</span>
          </div>
          {overviewOpen && (
            <div className="admin-panel__overview">
              <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.connectedPlayers}</span><span className="admin-panel__stat-label">Connectés</span></div>
              <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.registeredCharacters}</span><span className="admin-panel__stat-label">Personnages</span></div>
              <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.activeCreatures}</span><span className="admin-panel__stat-label">Animaux</span></div>
              <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.templates}</span><span className="admin-panel__stat-label">Templates</span></div>
              <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.spawns}</span><span className="admin-panel__stat-label">Spawns</span></div>
            </div>
          )}
        </section>
      )}

      <section className="admin-panel__section">
        <div className="admin-panel__section-header" onClick={() => setMetricsOpen((o) => !o)}>
          <AdminSectionTitle title="Movement Metrics" icon="📈" />
          <span className="admin-panel__section-chevron">{metricsOpen ? "▼" : "▶"}</span>
        </div>
        {metricsOpen && (
          <>
            <div className="admin-panel__metric-actions">
              <button
                className="admin-panel__tp-btn"
                disabled={movementMetricsLoading}
                onClick={refreshMovementMetrics}
              >
                Refresh
              </button>
              <button
                className="admin-panel__tp-btn"
                disabled={movementMetricsLoading}
                onClick={resetMovementMetrics}
              >
                Reset
              </button>
            </div>
            <div className="admin-panel__metric-grid">
              {[
                ["Total moves", movementMetrics?.totalMoves],
                ["Suspect teleports", movementMetrics?.suspectTeleports],
                ["Suspect speed", movementMetrics?.suspectSpeed],
                ["Invalid coordinates", movementMetrics?.invalidCoordinates],
                ["Map mismatch", movementMetrics?.mapMismatch],
              ].map(([label, value]) => (
                <div key={label} className="admin-panel__metric">
                  <span className="admin-panel__metric-value">
                    {value ?? "–"}
                  </span>
                  <span className="admin-panel__metric-label">{label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {groupedConfigs.filter((cfg) => cfg.id === "creatures").map((cfg) => (
        <GroupedSection
          key={cfg.id}
          config={cfg}
          groups={groupData[cfg.id] ?? []}
          instances={instanceData[cfg.id] ?? []}
          onResult={pushResult}
          onInstanceDeleted={(ik) => handleInstanceDeleted(cfg.id, ik)}
          highlightId={highlightIds[cfg.id] ?? null}
          // V5-A : capacités configurables au niveau TEMPLATE (config only, aucun
          // cast auto). Toujours visible, indépendant du runtime de l'instance.
          renderGroupExtra={(group) => <CreatureAbilitiesEditor templateKey={group.key} />}
          // Runtime combat : uniquement pour l'instance sélectionnée (1 fetch),
          // et sans conditionner l'édition des capacités.
          renderInstanceExtra={(inst) =>
            selectedWO?.category === "creature" && selectedWO?.id === inst.id ? (
              <CreatureRuntimeInspector creatureId={inst.id} />
            ) : null
          }
          rightHeader={
            <span className="admin-panel__count">
              {(groupData["creatures"] ?? []).length} créature{(groupData["creatures"] ?? []).length > 1 ? "s" : ""}
            </span>
          }
          topContent={
            <>
            <div className="admin-panel__create-head">
              <button type="button" className="admin-panel__create-toggle" onClick={() => setCreateCreatureOpen((o) => !o)}>
                <span className="admin-panel__section-chevron">{createCreatureOpen ? "▼" : "▶"}</span>
                Créer créature
              </button>
            </div>
            {createCreatureOpen && (
            <div className="admin-panel__template-item admin-panel__template-item--create">
              <div className="admin-panel__template-stats admin-panel__template-stats--create">
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Key</span>
                  <input className="admin-panel__template-stat-input" type="text"
                    value={newCreature.key}
                    onChange={(e) => setNewCreature((prev) => ({ ...prev, key: e.target.value }))}
                    {...kbHandlers} />
                  <span className="admin-panel__field-hint">snake_case, non modifiable après création</span>
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Nom</span>
                  <input className="admin-panel__template-stat-input" type="text"
                    value={newCreature.name}
                    onChange={(e) => setNewCreature((prev) => ({ ...prev, name: e.target.value }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Texture</span>
                  <AssetPicker
                    value={newCreature.textureKey}
                    onChange={(path) => setNewCreature((prev) => ({ ...prev, textureKey: path }))}
                    category="bestiary"
                  />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">PV</span>
                  <input className="admin-panel__template-stat-input" type="number" min={1}
                    value={newCreature.baseHealth}
                    onChange={(e) => setNewCreature((prev) => ({ ...prev, baseHealth: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">ATK</span>
                  <input className="admin-panel__template-stat-input" type="number" min={0}
                    value={newCreature.baseAttack}
                    onChange={(e) => setNewCreature((prev) => ({ ...prev, baseAttack: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">ARM</span>
                  <input className="admin-panel__template-stat-input" type="number" min={0}
                    value={newCreature.baseArmor}
                    onChange={(e) => setNewCreature((prev) => ({ ...prev, baseArmor: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Aggro</span>
                  <input className="admin-panel__template-stat-input" type="number" min={0}
                    value={newCreature.aggroRadius}
                    onChange={(e) => setNewCreature((prev) => ({ ...prev, aggroRadius: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Respawn (ms)</span>
                  <input className="admin-panel__template-stat-input" type="number" min={1} step={1000}
                    value={newCreature.respawnDelayMs}
                    onChange={(e) => setNewCreature((prev) => ({ ...prev, respawnDelayMs: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
              </div>
              <button className="admin-panel__apply-btn" disabled={creating}
                onClick={async () => {
                  const socket = getSocket();
                  if (!socket?.connected) { pushResult("Socket non connecté.", false); return; }
                  setCreating(true);
                  const result = await ackPromise(socket, "admin:create_creature_template", { fields: newCreature });
                  setCreating(false);
                  pushResult(result.message, result.success);
                  if (result.success && result.data) {
                    setGroupData((prev) => ({ ...prev, creatures: [...(prev.creatures ?? []), result.data as any] }));
                    setNewCreature({ ...NEW_CREATURE_DEFAULT });
                    setCreateCreatureOpen(false);
                  }
                }}>
                {creating ? "…" : "Créer"}
              </button>
            </div>
            )}
            </>
          }
        />
      ))}

      {groupedConfigs.filter((cfg) => cfg.id === "resources").map((cfg) => (
        <GroupedSection
          key={cfg.id}
          config={cfg}
          groups={groupData[cfg.id] ?? []}
          instances={instanceData[cfg.id] ?? []}
          onResult={pushResult}
          onInstanceDeleted={(ik) => handleInstanceDeleted(cfg.id, ik)}
          highlightId={highlightIds[cfg.id] ?? null}
          renderGroupExtra={(group) => (
            <ResourceLootPoolEditor
              group={group}
              items={items}
              onResult={pushResult}
              onSaved={(type, lootPool) => setGroupData((prev) => ({
                ...prev,
                resources: (prev.resources ?? []).map((r: any) =>
                  r.type === type
                    ? { ...r, lootPool, lootPoolItems: lootPool.map((e) => e.itemId) }
                    : r,
                ),
              }))}
            />
          )}
          rightHeader={
            <span className="admin-panel__count">
              {(groupData["resources"] ?? []).length} ressource{(groupData["resources"] ?? []).length > 1 ? "s" : ""}
            </span>
          }
          topContent={
            <>
            <div className="admin-panel__create-head">
              <button
                type="button"
                className="admin-panel__create-toggle"
                onClick={() => setCreateResourceTemplateOpen((o) => !o)}
              >
                <span className="admin-panel__section-chevron">{createResourceTemplateOpen ? "▼" : "▶"}</span>
                Créer ressource
              </button>
            </div>
            {createResourceTemplateOpen && (
            <div className="admin-panel__template-item admin-panel__template-item--create">
              <div className="admin-panel__template-stats admin-panel__template-stats--create">
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Type</span>
                  <input className="admin-panel__template-stat-input" type="text"
                    value={newResourceTemplate.type}
                    onChange={(e) => setNewResourceTemplate((prev) => ({ ...prev, type: e.target.value }))}
                    {...kbHandlers} />
                  <span className="admin-panel__field-hint">snake_case, non modifiable après création</span>
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Texture</span>
                  <AssetPicker
                    value={newResourceTemplate.textureKey}
                    onChange={(path) => setNewResourceTemplate((prev) => ({ ...prev, textureKey: path }))}
                    category="sprites"
                  />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Loots défaut</span>
                  <input className="admin-panel__template-stat-input" type="number" min={1}
                    value={newResourceTemplate.defaultRemainingLoots}
                    onChange={(e) => setNewResourceTemplate((prev) => ({ ...prev, defaultRemainingLoots: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Respawn (ms)</span>
                  <input className="admin-panel__template-stat-input" type="number" min={1} step={1000}
                    value={newResourceTemplate.respawnDelayMs}
                    onChange={(e) => setNewResourceTemplate((prev) => ({ ...prev, respawnDelayMs: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">XP perso récolte</span>
                  <input className="admin-panel__template-stat-input" type="number" min={0}
                    value={newResourceTemplate.gatherCharacterXpReward}
                    onChange={(e) => setNewResourceTemplate((prev) => ({ ...prev, gatherCharacterXpReward: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Difficulté récolte (0–100)</span>
                  <input className="admin-panel__template-stat-input" type="number" min={0} max={100}
                    value={newResourceTemplate.gatheringDifficulty}
                    onChange={(e) => setNewResourceTemplate((prev) => ({ ...prev, gatheringDifficulty: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">XP maîtrise estimée</span>
                  <span className="admin-panel__field-hint">
                    {gatherMasteryXpLabel(newResourceTemplate.type, newResourceTemplate.gatheringDifficulty)}
                  </span>
                </label>
              </div>

              <div className="admin-panel__lootpool-editor">
                <div className="admin-panel__lootpool-head">
                  <span className="admin-panel__template-stat-label">Loot pool</span>
                  <button type="button" className="admin-panel__lootpool-add"
                    onClick={() => setNewResourceTemplate((prev) => ({
                      ...prev,
                      lootPool: [...prev.lootPool, { itemId: "", minQty: 1, maxQty: 1, probability: 1 }],
                    }))}>
                    + Ligne
                  </button>
                </div>
                {newResourceTemplate.lootPool.length === 0 ? (
                  <span className="admin-panel__field-hint">Aucune entrée (loot vide).</span>
                ) : (
                <div className="admin-panel__lootpool-grid">
                  <span className="admin-panel__lootpool-col">Item</span>
                  <span className="admin-panel__lootpool-col">Min</span>
                  <span className="admin-panel__lootpool-col">Max</span>
                  <span className="admin-panel__lootpool-col">Chance (0–1)</span>
                  <span className="admin-panel__lootpool-col" />
                {newResourceTemplate.lootPool.map((entry, idx) => (
                  <div key={idx} className="admin-panel__lootpool-row admin-panel__lootpool-row--grid">
                    <LootItemPicker
                      items={items}
                      value={entry.itemId}
                      onChange={(id) => setNewResourceTemplate((prev) => {
                        const lootPool = [...prev.lootPool];
                        lootPool[idx] = { ...lootPool[idx], itemId: id };
                        return { ...prev, lootPool };
                      })}
                    />
                    <input className="admin-panel__lootpool-num" type="number" min={1} title="Min"
                      value={entry.minQty}
                      onChange={(e) => setNewResourceTemplate((prev) => {
                        const lootPool = [...prev.lootPool];
                        lootPool[idx] = { ...lootPool[idx], minQty: Number(e.target.value) };
                        return { ...prev, lootPool };
                      })} {...kbHandlers} />
                    <input className="admin-panel__lootpool-num" type="number" min={1} title="Max"
                      value={entry.maxQty}
                      onChange={(e) => setNewResourceTemplate((prev) => {
                        const lootPool = [...prev.lootPool];
                        lootPool[idx] = { ...lootPool[idx], maxQty: Number(e.target.value) };
                        return { ...prev, lootPool };
                      })} {...kbHandlers} />
                    <input className="admin-panel__lootpool-num" type="number" min={0} max={1} step={0.05} title="Chance (0–1)"
                      value={entry.probability}
                      onChange={(e) => setNewResourceTemplate((prev) => {
                        const lootPool = [...prev.lootPool];
                        lootPool[idx] = { ...lootPool[idx], probability: Number(e.target.value) };
                        return { ...prev, lootPool };
                      })} {...kbHandlers} />
                    <button type="button" className="admin-panel__lootpool-remove"
                      onClick={() => setNewResourceTemplate((prev) => ({
                        ...prev,
                        lootPool: prev.lootPool.filter((_, i) => i !== idx),
                      }))}>✕</button>
                  </div>
                ))}
                </div>
                )}
              </div>
              <button className="admin-panel__apply-btn" disabled={creating}
                onClick={async () => {
                  const socket = getSocket();
                  if (!socket?.connected) { pushResult("Socket non connecté.", false); return; }
                  setCreating(true);
                  // Sanitize lootPool : on retire les lignes sans item choisi.
                  const cleanLootPool = newResourceTemplate.lootPool.filter((e) => e.itemId.trim() !== "");
                  const result = await ackPromise(socket, "admin:create_resource_template", {
                    fields: { ...newResourceTemplate, lootPool: cleanLootPool },
                  });
                  setCreating(false);
                  pushResult(result.message, result.success);
                  if (result.success && result.data) {
                    const tpl = result.data as any;
                    setGroupData((prev) => {
                      const others = (prev.resources ?? []).filter((r: any) => r.type !== tpl.type);
                      return { ...prev, resources: [...others, mapResourceTemplate(tpl)] };
                    });
                    setNewResourceTemplate({ ...NEW_RESOURCE_TEMPLATE_DEFAULT });
                    setCreateResourceTemplateOpen(false);
                  }
                }}>
                {creating ? "…" : "Créer"}
              </button>
            </div>
            )}
            </>
          }
        />
      ))}

      {groupedConfigs.filter((cfg) => cfg.id === "craftingStations").map((cfg) => (
        <GroupedSection
          key={cfg.id}
          config={cfg}
          groups={groupData[cfg.id] ?? []}
          instances={instanceData[cfg.id] ?? []}
          onResult={pushResult}
          onInstanceDeleted={(ik) => handleInstanceDeleted(cfg.id, ik)}
          highlightId={highlightIds[cfg.id] ?? null}
          rightHeader={
            <span className="admin-panel__count">
              {(groupData["craftingStations"] ?? []).length} station{(groupData["craftingStations"] ?? []).length > 1 ? "s" : ""}
            </span>
          }
          topContent={
            <>
            <div className="admin-panel__create-head">
              <button type="button" className="admin-panel__create-toggle" onClick={() => setNewStationTemplateOpen((o) => !o)}>
                <span className="admin-panel__section-chevron">{newStationTemplateOpen ? "▼" : "▶"}</span>
                Créer une station
              </button>
            </div>
            {newStationTemplateOpen && (
            <div className="admin-panel__template-item admin-panel__template-item--create">
              <div className="admin-panel__template-stats admin-panel__template-stats--create">
                {(["key", "name"] as const).map((f) => (
                  <label key={f} className="admin-panel__template-stat">
                    <span className="admin-panel__template-stat-label">{f === "key" ? "Key" : "Nom"}</span>
                    <input className="admin-panel__template-stat-input" type="text"
                      value={newStationTemplate[f]}
                      onChange={(e) => setNewStationTemplate((prev) => ({ ...prev, [f]: e.target.value }))}
                      {...kbHandlers} />
                  </label>
                ))}
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Station</span>
                  <select className="admin-panel__template-stat-input"
                    value={newStationTemplate.stationType}
                    onChange={(e) => setNewStationTemplate((prev) => ({ ...prev, stationType: e.target.value }))}
                    {...kbHandlers}>
                    {STATION_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Catégorie</span>
                  <input className="admin-panel__template-stat-input" type="text"
                    value={newStationTemplate.category}
                    onChange={(e) => setNewStationTemplate((prev) => ({ ...prev, category: e.target.value }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Maîtrise requise</span>
                  <select className="admin-panel__template-stat-input"
                    value={newStationTemplate.requiredMasteryKey}
                    onChange={(e) => setNewStationTemplate((prev) => ({ ...prev, requiredMasteryKey: e.target.value }))}
                    {...kbHandlers}>
                    <option value="">—</option>
                    {(sectionData["masteries"] ?? []).map((sd: any) => <option key={sd.key} value={sd.key}>{sd.name} ({sd.key})</option>)}
                  </select>
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Rayon WU</span>
                  <input className="admin-panel__template-stat-input" type="number" min={1}
                    value={newStationTemplate.interactionRadiusWU}
                    onChange={(e) => setNewStationTemplate((prev) => ({ ...prev, interactionRadiusWU: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Texture</span>
                  <AssetPicker
                    value={newStationTemplate.textureKey}
                    onChange={(path) => setNewStationTemplate((prev) => ({ ...prev, textureKey: path }))}
                    category="buildings"
                  />
                </label>
              </div>
              <button className="admin-panel__apply-btn" disabled={creating}
                onClick={async () => {
                  const socket = getSocket();
                  if (!socket?.connected) { pushResult("Socket non connecté.", false); return; }
                  setCreating(true);
                  const result = await ackPromise(socket, "admin:create_crafting_station_template", { fields: newStationTemplate });
                  setCreating(false);
                  pushResult(result.message, result.success);
                  if (result.success && result.data) {
                    setGroupData((prev) => ({ ...prev, craftingStations: [...(prev.craftingStations ?? []), result.data as any] }));
                    setNewStationTemplate({ ...NEW_STATION_TEMPLATE_DEFAULT });
                    setNewStationTemplateOpen(false);
                  }
                }}>
                {creating ? "…" : "Créer"}
              </button>
            </div>
            )}
            </>
          }
        />
      ))}

      {groupedConfigs.filter((cfg) => cfg.id === "buildings").map((cfg) => (
        <GroupedSection
          key={cfg.id}
          config={cfg}
          groups={groupData[cfg.id] ?? []}
          instances={instanceData[cfg.id] ?? []}
          onResult={pushResult}
          onInstanceDeleted={(ik) => handleInstanceDeleted(cfg.id, ik)}
          highlightId={highlightIds[cfg.id] ?? null}
          rightHeader={
            <span className="admin-panel__count">
              {(groupData["buildings"] ?? []).length} building{(groupData["buildings"] ?? []).length > 1 ? "s" : ""}
            </span>
          }
          topContent={
            <>
            <div className="admin-panel__create-head">
              <button type="button" className="admin-panel__create-toggle" onClick={() => setNewBuildingTemplateOpen((o) => !o)}>
                <span className="admin-panel__section-chevron">{newBuildingTemplateOpen ? "▼" : "▶"}</span>
                Créer un building
              </button>
            </div>
            {newBuildingTemplateOpen && (
            <div className="admin-panel__template-item admin-panel__template-item--create">
              <div className="admin-panel__template-stats admin-panel__template-stats--create">
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Key</span>
                  <input className="admin-panel__template-stat-input" type="text"
                    value={newBuildingTemplate.key}
                    onChange={(e) => setNewBuildingTemplate((prev) => ({ ...prev, key: e.target.value }))}
                    {...kbHandlers} />
                  <span className="admin-panel__field-hint">snake_case, non modifiable après création</span>
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Nom</span>
                  <input className="admin-panel__template-stat-input" type="text"
                    value={newBuildingTemplate.name}
                    onChange={(e) => setNewBuildingTemplate((prev) => ({ ...prev, name: e.target.value }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Type</span>
                  <select className="admin-panel__template-stat-input"
                    value={newBuildingTemplate.buildingType}
                    onChange={(e) => setNewBuildingTemplate((prev) => ({ ...prev, buildingType: e.target.value }))}
                    {...kbHandlers}>
                    {BUILDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Texture</span>
                  <AssetPicker
                    value={newBuildingTemplate.textureKey}
                    onChange={(path) => setNewBuildingTemplate((prev) => ({ ...prev, textureKey: path }))}
                    category="buildings"
                  />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Rayon WU</span>
                  <input className="admin-panel__template-stat-input" type="number" min={1}
                    value={newBuildingTemplate.interactionRadiusWU}
                    onChange={(e) => setNewBuildingTemplate((prev) => ({ ...prev, interactionRadiusWU: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
              </div>
              <button className="admin-panel__apply-btn" disabled={creating}
                onClick={async () => {
                  const socket = getSocket();
                  if (!socket?.connected) { pushResult("Socket non connecté.", false); return; }
                  setCreating(true);
                  const fields = {
                    ...newBuildingTemplate,
                    textureKey: newBuildingTemplate.textureKey || null,
                  };
                  const result = await ackPromise(socket, "admin:create_building_template", { fields });
                  setCreating(false);
                  pushResult(result.message, result.success);
                  if (result.success && result.data) {
                    setGroupData((prev) => ({ ...prev, buildings: [...(prev.buildings ?? []), result.data as any] }));
                    setNewBuildingTemplate({ ...NEW_BUILDING_TEMPLATE_DEFAULT });
                    setNewBuildingTemplateOpen(false);
                  }
                }}>
                {creating ? "…" : "Créer"}
              </button>
            </div>
            )}
            </>
          }
        />
      ))}

      <PlayerSection players={sectionData["players"] ?? []} items={items} onResult={pushResult} onPlayerRowUpdated={patchPlayerRow} />

      {/* L'édition/création des maîtrises vit dans le module Studio
          « Maîtrises / Effets » (MasteryEffectsModule) — l'ancien Mastery Editor
          socket a été retiré (Mastery Effects V2). sectionData["masteries"]
          reste chargé : recettes et stations en dépendent (selects). */}

      <RecipesSection
        recipes={recipes}
        masteryDefinitions={sectionData["masteries"] ?? []}
        items={items}
        onResult={pushResult}
        onRecipeCreated={(r) => setRecipes((prev) => [...prev, r])}
        onRecipeUpdated={(r) => setRecipes((prev) => prev.map((x) => x.id === r.id ? { ...x, ...r } : x))}
        onIngredientAdded={(recipeId, ing) =>
          setRecipes((prev) => prev.map((x) => x.id === recipeId ? { ...x, ingredients: [...x.ingredients, ing] } : x))
        }
        onIngredientRemoved={(recipeId, ingId) =>
          setRecipes((prev) => prev.map((x) => x.id === recipeId ? { ...x, ingredients: x.ingredients.filter((i: any) => i.id !== ingId) } : x))
        }
        onResultAdded={(recipeId, res) =>
          setRecipes((prev) => prev.map((x) => x.id === recipeId ? { ...x, results: [...x.results, res] } : x))
        }
        onResultRemoved={(recipeId, resId) =>
          setRecipes((prev) => prev.map((x) => x.id === recipeId ? { ...x, results: x.results.filter((r: any) => r.id !== resId) } : x))
        }
      />
    </div>
  );
}
