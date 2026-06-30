import { useEffect, useMemo, useState, useRef } from "react";
import { getDevToolsStore, useDevToolsStore } from "../../store/devtools.store";
import { parseCommand } from "../../phaser/admin/commandParser";
import { commandRegistry, autocompleteCommand } from "../../phaser/admin/commandRegistry";
import { type WorldObject } from "../DevTools/types/worldObject.types";
import {
  type GroupedSectionConfig,
  type SectionConfig,
  type ConsoleLine,
  type InstanceAction,
  fetchAdmin,
  ackPromise,
  getSocket,
  kbHandlers,
  GroupedSection,
  EntitySection,
} from "./adminPanel.shared";
import RecipesSection from "./RecipesSection";
import { studioAppearanceRegistry } from "../../studio/sdk/appearanceLibrary";

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

// ── Constantes skills ─────────────────────────────────────────────────────────

const SKILL_CATEGORIES = ["gathering", "crafting", "combat", "social", "leadership", "general"];
const STATION_TYPES = ["forge", "workbench", "sawmill", "alchemy_table", "cooking_station", "tailoring_station", "jewelry_table"];
const BUILDING_TYPES = ["auction_house", "mailbox", "bank", "guild_hall", "house_door", "teleport", "dungeon_entrance", "shrine"];
const BUILDING_STATES = ["ACTIVE", "DISABLED", "LOCKED", "UNDER_CONSTRUCTION", "DESTROYED"];

const SKILL_FIELDS = [
  { key: "name",            label: "Nom",       type: "text" as const },
  { key: "category",        label: "Catégorie", options: SKILL_CATEGORIES },
  { key: "maxLevel",        label: "Niv. max",  min: 2 },
  { key: "baseXpPerLevel",  label: "XP/niv",    min: 1 },
  { key: "xpCurveExponent", label: "Courbe",    min: 1, step: 0.1 },
  { key: "enabled",         label: "Actif",     options: ["true", "false"] },
];

const SKILLS_SECTION_CONFIG: SectionConfig = {
  id: "skills",
  title: "Skills",
  fetchPath: "/admin/skill-definitions",
  saveEvent: "admin:update_skill_definition",
  getEntityKey:  (sd) => sd.id,
  getDisplayKey: (sd) => sd.key,
  getName: (sd) => `${sd.name} (${sd.key})`,
  fields: SKILL_FIELDS,
};

// ── Configs (identiques au legacy) ────────────────────────────────────────────

function buildGroupedSectionConfigs(skillKeys: string[]): GroupedSectionConfig[] {
  const skillKeyOptions = ["", ...skillKeys];
  const creatureTextureOptions = studioAppearanceRegistry.getAppearancesByCategory('creature').map((a) => a.textureKey);
  const resourceTextureOptions = studioAppearanceRegistry.getAppearancesByCategory('resource').map((a) => a.textureKey);
  return [
  {
    id: "creatures",
    title: "Créatures",
    getGroupKey:  (t) => t.key,
    getGroupName: (t) => t.name,
    groupFields: [
      { key: "name",             label: "Nom",          type: "text" as const },
      { key: "textureKey",       label: "Texture",      options: creatureTextureOptions },
      { key: "baseHealth",       label: "PV",           min: 1 },
      { key: "baseAttack",       label: "ATK",          min: 0 },
      { key: "baseArmor",        label: "ARM",          min: 0 },
      { key: "aggroRadius",      label: "Aggro",        min: 0 },
      { key: "fleeThresholdPct", label: "Fuite%",       min: 0 },
      { key: "respawnDelayMs",   label: "Respawn (ms)", min: 1, step: 1000 },
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
    title: "Ressources",
    getGroupKey:  (t) => t.type,
    getGroupName: (t) => t.type,
    groupFields: [
      { key: "textureKey",            label: "Texture",       options: resourceTextureOptions },
      { key: "defaultRemainingLoots", label: "Loots défaut",  min: 1 },
      { key: "respawnDelayMs",        label: "Respawn (ms)",  min: 1, step: 1000 },
      { key: "gatheringXpReward",     label: "XP récolte",    min: 0 },
      { key: "skillKey",              label: "Skill",         options: skillKeyOptions },
    ],
    groupSaveEvent: "admin:update_resource_template",
    getGroupSavePayload: (t, fields) => ({ type: t.type, fields }),
    getGroupInfoLine: (t) => {
      const items: string[] = t.lootPoolItems ?? [];
      if (items.length === 0) return null;
      return `Loot pool (lecture seule) : ${items.join(", ")}`;
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
    title: "Crafting Stations",
    getGroupKey:  (t) => t.id,
    getGroupName: (t) => `${t.name} (${t.stationType})`,
    groupFields: [
      { key: "name",                label: "Nom",          type: "text" as const },
      { key: "stationType",         label: "Station",      options: STATION_TYPES },
      { key: "category",            label: "Catégorie",    options: ["smithing", "woodworking", "alchemy", "cooking", "crafting", "general"] },
      { key: "requiredSkillKey",    label: "Skill requis", options: skillKeyOptions },
      { key: "interactionRadiusWU", label: "Rayon WU",     min: 1 },
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
    title: "Buildings",
    getGroupKey:  (t) => t.id,
    getGroupName: (t) => `${t.name} (${t.buildingType})`,
    groupFields: [
      { key: "name",                label: "Nom",          type: "text" as const },
      { key: "textureKey",          label: "Texture",      type: "text" as const },
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

const SECTION_CONFIGS: SectionConfig[] = [
  {
    id: "players",
    title: "Joueurs",
    fetchPath: "/admin/characters",
    saveEvent: "admin:update_character",
    getEntityKey: (c) => c.id,
    getDisplayKey: (c) => c.id,
    getName: (c) => c.name,
    fields: [
      { key: "level",     label: "Niv",    min: 1 },
      { key: "health",    label: "HP",     min: 0 },
      { key: "maxHealth", label: "HP max", min: 1 },
      { key: "attack",    label: "ATK",    min: 0 },
      { key: "defense",   label: "DEF",    min: 0 },
    ],
    getTpPosition: (c) => c.worldX != null && c.worldY != null ? { worldX: c.worldX, worldY: c.worldY } : null,
    dragEvent: "admin:teleport",
    getDragPayload: (c, worldX, worldY) => ({ characterId: c.id, worldX, worldY }),
  },
];

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

function wosToResourceTemplates(wos: WorldObject[]): any[] {
  const map = new Map<string, any>();
  for (const wo of wos) {
    if (!map.has(wo.type)) {
      map.set(wo.type, {
        type: wo.type,
        textureKey:            (wo.metadata.textureKey as string | null)     ?? 'dead_tree',
        defaultRemainingLoots: (wo.metadata.defaultRemainingLoots as number) ?? 0,
        respawnDelayMs:        (wo.metadata.respawnDelayMs as number)        ?? 0,
        lootPoolItems:         (wo.metadata.lootPoolItems as string[])       ?? [],
        skillKey:              (wo.metadata.skillKey as string | null)       ?? null,
        gatheringXpReward:     (wo.metadata.gatheringXpReward as number)     ?? 0,
      });
    }
  }
  return Array.from(map.values());
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
    requiredSkillKey: (wo.metadata.requiredSkillKey as string | null) ?? "",
    interactionRadiusWU: (wo.metadata.interactionRadiusWU as number) ?? 1536,
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

const NEW_SKILL_DEFAULT = { key: "", name: "", category: "gathering", maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5 };
const NEW_CREATURE_DEFAULT = { key: "", name: "", textureKey: "turkey", baseHealth: 30, baseAttack: 3, baseArmor: 0, aggroRadius: 0, fleeThresholdPct: 0, respawnDelayMs: 20000 };
const NEW_RESOURCE_TEMPLATE_DEFAULT = { type: "", textureKey: "dead_tree", defaultRemainingLoots: 4, respawnDelayMs: 30000, gatheringXpReward: 0, skillKey: "" };
const NEW_STATION_TEMPLATE_DEFAULT = {
  key: "",
  name: "",
  stationType: "forge",
  category: "smithing",
  requiredSkillKey: "",
  interactionRadiusWU: 1536,
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

// ── EconomySection ────────────────────────────────────────────────────────────

function EconomySection({ characters, onResult }: { characters: any[]; onResult: (text: string, ok: boolean) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [characterId, setCharacterId] = useState("");
  const [amountBronze, setAmountBronze] = useState(100);
  const [loading, setLoading] = useState(false);

  async function send(direction: "credit" | "debit") {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    if (!characterId) { onResult("Sélectionner un personnage.", false); return; }
    const amount = Math.floor(amountBronze);
    if (amount <= 0) { onResult("Le montant doit être positif.", false); return; }
    setLoading(true);
    const result = await ackPromise(socket, "admin:add_balance", { characterId, amountBronze: amount, direction });
    setLoading(false);
    onResult(result.message, result.success);
  }

  return (
    <section className="admin-panel__section">
      <div className="admin-panel__section-toggle" onClick={() => setIsOpen((o) => !o)}>
        <span className="admin-panel__section-chevron">{isOpen ? "▼" : "▶"}</span>
        Économie
      </div>
      {isOpen && (
        <div className="admin-panel__template-item">
          <div className="admin-panel__template-stats">
            <label className="admin-panel__template-stat">
              <span className="admin-panel__template-stat-label">Personnage</span>
              <select className="admin-panel__template-stat-input" value={characterId}
                onChange={(e) => setCharacterId(e.target.value)} {...kbHandlers}>
                <option value="">— choisir —</option>
                {characters.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="admin-panel__template-stat">
              <span className="admin-panel__template-stat-label">Bronze</span>
              <input className="admin-panel__template-stat-input" type="number" min={1} step={1}
                value={amountBronze}
                onChange={(e) => setAmountBronze(Number(e.target.value))}
                {...kbHandlers} />
            </label>
          </div>
          <div className="admin-panel__button-row">
            <button className="admin-panel__apply-btn" disabled={loading} onClick={() => send("credit")}>
              {loading ? "…" : "Créditer"}
            </button>
            <button className="admin-panel__apply-btn" disabled={loading} onClick={() => send("debit")}>
              {loading ? "…" : "Débiter"}
            </button>
          </div>
        </div>
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
  const [groupData,    setGroupData]    = useState<Record<string, any[]>>({});
  const [instanceData, setInstanceData] = useState<Record<string, any[]>>({});
  const [error,   setError]   = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [results, setResults] = useState<ConsoleLine[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [createSkillOpen, setCreateSkillOpen] = useState(false);
  const [newSkill, setNewSkill] = useState({ ...NEW_SKILL_DEFAULT });
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
    () => buildGroupedSectionConfigs((sectionData["skills"] ?? []).map((sd: any) => sd.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionData["skills"]],
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
      // Ressources : templates dérivés du WOM, instances du WOM
      fetchAdmin<WorldObject[]>("/admin/resources/world-objects", token).then((wos) => {
        setGroupData((prev)    => ({ ...prev, resources: wosToResourceTemplates(wos) }));
        setInstanceData((prev) => ({ ...prev, resources: wosToResourceInstances(wos) }));
      }),
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
      // Skills : liste via REST
      fetchAdmin<any[]>("/admin/skill-definitions", token).then((data) =>
        setSectionData((prev) => ({ ...prev, skills: data }))
      ),
      // Items : pour les sélecteurs ingrédients/résultats
      fetchAdmin<any[]>("/admin/items", token).then(setItems),
      // Recettes crafting
      fetchAdmin<any[]>("/admin/crafting-recipes", token).then(setRecipes),
      fetchAdmin<MovementMetrics>("/admin/movement-metrics", token).then(setMovementMetrics),
    ];
    Promise.all(fetches).catch(() => setError("Impossible de charger les données admin."));
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
            <span className="admin-panel__section-toggle">
              <span className="admin-panel__section-chevron">{overviewOpen ? "▼" : "▶"}</span>
              Vue d&apos;ensemble
            </span>
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
          <span className="admin-panel__section-toggle">
            <span className="admin-panel__section-chevron">{metricsOpen ? "▼" : "▶"}</span>
            Movement Metrics
          </span>
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
          rightHeader={
            <div className="admin-panel__section-toggle" onClick={() => setCreateCreatureOpen((o) => !o)}>
              Créer Créature
              <span className="admin-panel__section-chevron">{createCreatureOpen ? "▼" : "▶"}</span>
            </div>
          }
          rightContent={createCreatureOpen ? (
            <div className="admin-panel__template-item">
              <div className="admin-panel__template-stats">
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
                  <select className="admin-panel__template-stat-input"
                    value={newCreature.textureKey}
                    onChange={(e) => setNewCreature((prev) => ({ ...prev, textureKey: e.target.value }))}
                    {...kbHandlers}>
                    {studioAppearanceRegistry.getAppearancesByCategory('creature').map((a) => (
                      <option key={a.key} value={a.textureKey}>{a.name} ({a.textureKey})</option>
                    ))}
                  </select>
                  {studioAppearanceRegistry.getPreviewSrc(newCreature.textureKey) && (
                    <img
                      className="admin-panel__texture-preview"
                      src={studioAppearanceRegistry.getPreviewSrc(newCreature.textureKey)!}
                      alt={newCreature.textureKey}
                    />
                  )}
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
          ) : null}
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
          rightHeader={
            <div className="admin-panel__section-toggle" onClick={() => setCreateResourceTemplateOpen((o) => !o)}>
              Créer Ressource
              <span className="admin-panel__section-chevron">{createResourceTemplateOpen ? "▼" : "▶"}</span>
            </div>
          }
          rightContent={createResourceTemplateOpen ? (
            <div className="admin-panel__template-item">
              <div className="admin-panel__template-stats">
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
                  <select className="admin-panel__template-stat-input"
                    value={newResourceTemplate.textureKey}
                    onChange={(e) => setNewResourceTemplate((prev) => ({ ...prev, textureKey: e.target.value }))}
                    {...kbHandlers}>
                    {studioAppearanceRegistry.getAppearancesByCategory('resource').map((a) => (
                      <option key={a.key} value={a.textureKey}>{a.name} ({a.textureKey})</option>
                    ))}
                  </select>
                  {studioAppearanceRegistry.getPreviewSrc(newResourceTemplate.textureKey) && (
                    <img
                      className="admin-panel__texture-preview"
                      src={studioAppearanceRegistry.getPreviewSrc(newResourceTemplate.textureKey)!}
                      alt={newResourceTemplate.textureKey}
                    />
                  )}
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
                  <span className="admin-panel__template-stat-label">XP récolte</span>
                  <input className="admin-panel__template-stat-input" type="number" min={0}
                    value={newResourceTemplate.gatheringXpReward}
                    onChange={(e) => setNewResourceTemplate((prev) => ({ ...prev, gatheringXpReward: Number(e.target.value) }))}
                    {...kbHandlers} />
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Skill</span>
                  <select className="admin-panel__template-stat-input"
                    value={newResourceTemplate.skillKey}
                    onChange={(e) => setNewResourceTemplate((prev) => ({ ...prev, skillKey: e.target.value }))}
                    {...kbHandlers}>
                    <option value="">—</option>
                    {(sectionData["skills"] ?? []).map((sd: any) => <option key={sd.key} value={sd.key}>{sd.name} ({sd.key})</option>)}
                  </select>
                </label>
              </div>
              <button className="admin-panel__apply-btn" disabled={creating}
                onClick={async () => {
                  const socket = getSocket();
                  if (!socket?.connected) { pushResult("Socket non connecté.", false); return; }
                  setCreating(true);
                  const result = await ackPromise(socket, "admin:create_resource_template", { fields: newResourceTemplate });
                  setCreating(false);
                  pushResult(result.message, result.success);
                  if (result.success && result.data) {
                    const tpl = result.data as any;
                    setGroupData((prev) => ({
                      ...prev,
                      resources: [...(prev.resources ?? []), {
                        type: tpl.type,
                        textureKey: tpl.textureKey ?? 'dead_tree',
                        defaultRemainingLoots: tpl.defaultRemainingLoots,
                        respawnDelayMs: tpl.respawnDelayMs,
                        lootPoolItems: [],
                        skillKey: tpl.skillKey ?? null,
                        gatheringXpReward: tpl.gatheringXpReward ?? 0,
                      }],
                    }));
                    setNewResourceTemplate({ ...NEW_RESOURCE_TEMPLATE_DEFAULT });
                    setCreateResourceTemplateOpen(false);
                  }
                }}>
                {creating ? "…" : "Créer"}
              </button>
            </div>
          ) : null}
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
            <div className="admin-panel__section-toggle" onClick={() => setNewStationTemplateOpen((o) => !o)}>
              Créer une station
              <span className="admin-panel__section-chevron">{newStationTemplateOpen ? "▼" : "▶"}</span>
            </div>
          }
          rightContent={newStationTemplateOpen ? (
            <div className="admin-panel__template-item">
              <div className="admin-panel__template-stats">
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
                  <span className="admin-panel__template-stat-label">Skill requis</span>
                  <select className="admin-panel__template-stat-input"
                    value={newStationTemplate.requiredSkillKey}
                    onChange={(e) => setNewStationTemplate((prev) => ({ ...prev, requiredSkillKey: e.target.value }))}
                    {...kbHandlers}>
                    <option value="">—</option>
                    {(sectionData["skills"] ?? []).map((sd: any) => <option key={sd.key} value={sd.key}>{sd.name} ({sd.key})</option>)}
                  </select>
                </label>
                <label className="admin-panel__template-stat">
                  <span className="admin-panel__template-stat-label">Rayon WU</span>
                  <input className="admin-panel__template-stat-input" type="number" min={1}
                    value={newStationTemplate.interactionRadiusWU}
                    onChange={(e) => setNewStationTemplate((prev) => ({ ...prev, interactionRadiusWU: Number(e.target.value) }))}
                    {...kbHandlers} />
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
          ) : null}
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
            <div className="admin-panel__section-toggle" onClick={() => setNewBuildingTemplateOpen((o) => !o)}>
              Créer un building
              <span className="admin-panel__section-chevron">{newBuildingTemplateOpen ? "▼" : "▶"}</span>
            </div>
          }
          rightContent={newBuildingTemplateOpen ? (
            <div className="admin-panel__template-item">
              <div className="admin-panel__template-stats">
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
                  <input className="admin-panel__template-stat-input" type="text"
                    value={newBuildingTemplate.textureKey}
                    onChange={(e) => setNewBuildingTemplate((prev) => ({ ...prev, textureKey: e.target.value }))}
                    {...kbHandlers} />
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
          ) : null}
        />
      ))}

      {SECTION_CONFIGS.map((cfg) => (
        <EntitySection
          key={cfg.id}
          config={cfg}
          items={sectionData[cfg.id] ?? []}
          onResult={pushResult}
        />
      ))}

      <EconomySection characters={sectionData["players"] ?? []} onResult={pushResult} />

      <section className="admin-panel__section">
        <div className="admin-panel__dual-header">
          <div className="admin-panel__section-toggle" onClick={() => setSkillsOpen((o) => !o)}>
            <span className="admin-panel__section-chevron">{skillsOpen ? "▼" : "▶"}</span>
            Skills
          </div>
          <div className="admin-panel__section-toggle" onClick={() => setCreateSkillOpen((o) => !o)}>
            Créer Skill
            <span className="admin-panel__section-chevron">{createSkillOpen ? "▼" : "▶"}</span>
          </div>
        </div>
        {skillsOpen && (
          <EntitySection
            config={SKILLS_SECTION_CONFIG}
            items={sectionData["skills"] ?? []}
            onResult={pushResult}
            embedded
          />
        )}
        {createSkillOpen && (
          <div className="admin-panel__template-item">
            <div className="admin-panel__template-stats">
              <label className="admin-panel__template-stat">
                <span className="admin-panel__template-stat-label">Key</span>
                <input className="admin-panel__template-stat-input" type="text"
                  value={newSkill.key}
                  onChange={(e) => setNewSkill((prev) => ({ ...prev, key: e.target.value }))}
                  {...kbHandlers} />
                <span className="admin-panel__field-hint">snake_case, non modifiable après création</span>
              </label>
              <label className="admin-panel__template-stat">
                <span className="admin-panel__template-stat-label">Nom</span>
                <input className="admin-panel__template-stat-input" type="text"
                  value={newSkill.name}
                  onChange={(e) => setNewSkill((prev) => ({ ...prev, name: e.target.value }))}
                  {...kbHandlers} />
              </label>
              <label className="admin-panel__template-stat">
                <span className="admin-panel__template-stat-label">Catégorie</span>
                <select className="admin-panel__template-stat-input"
                  value={newSkill.category}
                  onChange={(e) => setNewSkill((prev) => ({ ...prev, category: e.target.value }))}
                  {...kbHandlers}>
                  {SKILL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="admin-panel__template-stat">
                <span className="admin-panel__template-stat-label">Niv. max</span>
                <input className="admin-panel__template-stat-input" type="number" min={1}
                  value={newSkill.maxLevel}
                  onChange={(e) => setNewSkill((prev) => ({ ...prev, maxLevel: Number(e.target.value) }))}
                  {...kbHandlers} />
              </label>
              <label className="admin-panel__template-stat">
                <span className="admin-panel__template-stat-label">XP/niv</span>
                <input className="admin-panel__template-stat-input" type="number" min={1}
                  value={newSkill.baseXpPerLevel}
                  onChange={(e) => setNewSkill((prev) => ({ ...prev, baseXpPerLevel: Number(e.target.value) }))}
                  {...kbHandlers} />
              </label>
              <label className="admin-panel__template-stat">
                <span className="admin-panel__template-stat-label">Exposant XP</span>
                <input className="admin-panel__template-stat-input" type="number" min={1} max={3} step={0.1}
                  value={newSkill.xpCurveExponent}
                  onChange={(e) => setNewSkill((prev) => ({ ...prev, xpCurveExponent: Number(e.target.value) }))}
                  {...kbHandlers} />
              </label>
            </div>
            <button className="admin-panel__apply-btn" disabled={creating}
              onClick={async () => {
                const socket = getSocket();
                if (!socket?.connected) { pushResult("Socket non connecté.", false); return; }
                setCreating(true);
                const result = await ackPromise(socket, "admin:create_skill_definition", { fields: newSkill });
                setCreating(false);
                pushResult(result.message, result.success);
                if (result.success && result.data) {
                  setSectionData((prev) => ({ ...prev, skills: [...(prev["skills"] ?? []), result.data as any] }));
                  setNewSkill({ ...NEW_SKILL_DEFAULT });
                }
              }}>
              {creating ? "…" : "Créer"}
            </button>
          </div>
        )}
      </section>

      <RecipesSection
        recipes={recipes}
        skillDefinitions={sectionData["skills"] ?? []}
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
