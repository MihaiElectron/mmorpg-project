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
  activeAnimals: number;
  connectedPlayers: number;
  registeredCharacters: number;
};

// ── Constantes skills ─────────────────────────────────────────────────────────

const SKILL_CATEGORIES = ["gathering", "crafting", "combat", "social", "leadership", "general"];

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
  return [
  {
    id: "creatures",
    title: "Créatures",
    getGroupKey:  (t) => t.key,
    getGroupName: (t) => t.name,
    groupFields: [
      { key: "baseHealth",       label: "PV",          min: 1 },
      { key: "baseAttack",       label: "ATK",         min: 0 },
      { key: "baseArmor",        label: "ARM",         min: 0 },
      { key: "aggroRadius",      label: "Aggro",       min: 0 },
      { key: "fleeThresholdPct", label: "Fuite%",      min: 0 },
      { key: "respawnDelayMs",   label: "Respawn (ms)", min: 1, step: 1000 },
    ],
    groupSaveEvent: "admin:update_template",
    getGroupSavePayload: (t, fields) => ({ key: t.key, fields }),
    dragEvent: "admin:spawn",
    getDragPayload: (t, x, y) => ({ templateKey: t.key, x, y }),
    getInstancesForGroup: (animals, template) =>
      animals.filter((a) => a.templateKey === template.key),
    getInstanceKey:  (a) => a.id,
    getInstanceName: (a) => a.id.slice(0, 8),
    getInstanceBadge: (a) => a.state,
    instanceFields: [
      { key: "state",          label: "État",         options: ["alive", "fighting", "escaping", "dead"] },
      { key: "health",         label: "HP",            min: 0 },
      { key: "respawnDelayMs", label: "Respawn (ms)",  min: 0, step: 1000 },
      { key: "x",              label: "X",             min: 0 },
      { key: "y",              label: "Y",             min: 0 },
    ],
    instanceSaveEvent: "admin:update_animal",
    getInstanceSavePayload: (a, fields) => ({ id: a.id, fields }),
    getInstanceTpPosition: (a) => ({ x: a.x, y: a.y }),
    instanceDeleteEvent: "admin:delete_animal",
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
    getDragPayload: (t, x, y) => ({ type: t.type, x, y }),
    getInstancesForGroup: (resources, tpl) =>
      resources.filter((r) => r.type === tpl.type),
    getInstanceKey:  (r) => r.id,
    getInstanceName: (r) => r.id.slice(0, 8),
    getInstanceBadge: (r) => r.state,
    instanceFields: [
      { key: "state",          label: "État",         options: ["alive", "dead"] },
      { key: "remainingLoots", label: "Loots",        min: 0 },
      { key: "respawnDelayMs", label: "Respawn (ms)", min: 0, step: 1000 },
      { key: "x",              label: "X",            min: 0 },
      { key: "y",              label: "Y",            min: 0 },
    ],
    instanceSaveEvent: "admin:update_resource",
    getInstanceSavePayload: (r, fields) => ({ id: r.id, fields }),
    getInstanceTpPosition: (r) => ({ x: r.x, y: r.y }),
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
    getTpPosition: (c) => c.positionX != null ? { x: c.positionX, y: c.positionY } : null,
    dragEvent: "admin:teleport",
    getDragPayload: (c, x, y) => ({ characterId: c.id, x, y }),
  },
];

// ── Adapters WOM → formes legacy ──────────────────────────────────────────────

function wosToAnimalInstances(wos: WorldObject[]): any[] {
  return wos.map((wo) => ({
    id: wo.id,
    templateKey: wo.type,
    state: wo.state,
    health: wo.health ?? 0,
    maxHealth: wo.maxHealth ?? 0,
    x: (wo.metadata.legacy as any)?.x ?? 0,
    y: (wo.metadata.legacy as any)?.y ?? 0,
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
    x: (wo.metadata.legacy as any)?.x ?? 0,
    y: (wo.metadata.legacy as any)?.y ?? 0,
    worldX:         wo.position?.worldX ?? null,
    worldY:         wo.position?.worldY ?? null,
    mapId:          wo.mapId ?? null,
    respawnAt:      wo.metadata.respawnAt ?? null,
    respawnDelayMs: (wo.metadata.instanceRespawnDelayMs as number | null) ?? 0,
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

export default function AdminPanelWOM() {
  const token = localStorage.getItem("token") ?? "";
  const selectedWO = useDevToolsStore((s) => s.selectedWorldObject);
  const highlightIds: Record<string, string | null> = {
    creatures: selectedWO?.category === "animal"   ? selectedWO.id : null,
    resources: selectedWO?.category === "resource" ? selectedWO.id : null,
  };
  const [overview,     setOverview]     = useState<Overview | null>(null);
  const [sectionData,  setSectionData]  = useState<Record<string, any[]>>({});
  const [groupData,    setGroupData]    = useState<Record<string, any[]>>({});
  const [instanceData, setInstanceData] = useState<Record<string, any[]>>({});
  const [error,   setError]   = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [results, setResults] = useState<ConsoleLine[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [newSkillOpen, setNewSkillOpen] = useState(false);
  const [newSkill, setNewSkill] = useState({ ...NEW_SKILL_DEFAULT });
  const [creating, setCreating] = useState(false);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

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
      fetchAdmin<WorldObject[]>("/admin/animals/world-objects", token).then((wos) =>
        setInstanceData((prev) => ({ ...prev, creatures: wosToAnimalInstances(wos) }))
      ),
      // Ressources : templates dérivés du WOM, instances du WOM
      fetchAdmin<WorldObject[]>("/admin/resources/world-objects", token).then((wos) => {
        setGroupData((prev)    => ({ ...prev, resources: wosToResourceTemplates(wos) }));
        setInstanceData((prev) => ({ ...prev, resources: wosToResourceInstances(wos) }));
      }),
      // Skills : liste via REST
      fetchAdmin<any[]>("/admin/skill-definitions", token).then((data) =>
        setSectionData((prev) => ({ ...prev, skills: data }))
      ),
      // Items : pour les sélecteurs ingrédients/résultats
      fetchAdmin<any[]>("/admin/items", token).then(setItems),
      // Recettes crafting
      fetchAdmin<any[]>("/admin/crafting-recipes", token).then(setRecipes),
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

    function onAnimalUpdate(dto: any) {
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
        if (!data.x || data.state === 'dead') return prev;
        return { ...prev, resources: [...list, data] };
      });
    }

    function onPlayerJoined() { setOverview((prev) => prev ? { ...prev, connectedPlayers: prev.connectedPlayers + 1 } : prev); }
    function onPlayerLeft()   { setOverview((prev) => prev ? { ...prev, connectedPlayers: Math.max(0, prev.connectedPlayers - 1) } : prev); }

    socket.on('animal_update', onAnimalUpdate);
    socket.on('resource_update', onResourceUpdate);
    socket.on('player_joined', onPlayerJoined);
    socket.on('player_left', onPlayerLeft);
    return () => {
      socket.off('animal_update', onAnimalUpdate);
      socket.off('resource_update', onResourceUpdate);
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
      getCharacterPos: () => null,
      getLastClickedPos: () => getDevToolsStore().getState().lastClickedPos,
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
          <h3 className="admin-panel__section-title">Vue d&apos;ensemble</h3>
          <div className="admin-panel__overview">
            <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.connectedPlayers}</span><span className="admin-panel__stat-label">Connectés</span></div>
            <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.registeredCharacters}</span><span className="admin-panel__stat-label">Personnages</span></div>
            <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.activeAnimals}</span><span className="admin-panel__stat-label">Animaux</span></div>
            <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.templates}</span><span className="admin-panel__stat-label">Templates</span></div>
            <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.spawns}</span><span className="admin-panel__stat-label">Spawns</span></div>
          </div>
        </section>
      )}

      {groupedConfigs.map((cfg) => (
        <GroupedSection
          key={cfg.id}
          config={cfg}
          groups={groupData[cfg.id] ?? []}
          instances={instanceData[cfg.id] ?? []}
          onResult={pushResult}
          onInstanceDeleted={(ik) => handleInstanceDeleted(cfg.id, ik)}
          highlightId={highlightIds[cfg.id] ?? null}
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

      <section className="admin-panel__section">
        <div className="admin-panel__section-header" onClick={() => setNewSkillOpen((o) => !o)}>
          <span className="admin-panel__section-toggle">
            <span className="admin-panel__section-chevron">{newSkillOpen ? "▼" : "▶"}</span>
            Créer un skill
          </span>
        </div>
        {newSkillOpen && (
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
                  setNewSkillOpen(false);
                }
              }}>
              {creating ? "…" : "Créer"}
            </button>
          </div>
        )}
      </section>

      <EntitySection
        config={SKILLS_SECTION_CONFIG}
        items={sectionData["skills"] ?? []}
        onResult={pushResult}
      />

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
