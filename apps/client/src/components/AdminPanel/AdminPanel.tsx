import { useEffect, useState, useRef } from "react";
import { getAdminStore } from "../../store/admin.store";
import { parseCommand } from "../../phaser/admin/commandParser";
import { commandRegistry, autocompleteCommand } from "../../phaser/admin/commandRegistry";

// ── Types ─────────────────────────────────────────────────────────────────────

type Overview = { templates: number; spawns: number; activeAnimals: number };
type ConsoleLine = { text: string; ok: boolean };

export type FieldDef = {
  key: string;
  label: string;
  min?: number;
  step?: number;
};

// Section plate (ex: Joueurs)
type SectionConfig = {
  id: string;
  title: string;
  fetchPath: string;
  saveEvent: string;
  getEntityKey: (item: any) => string;
  getDisplayKey: (item: any) => string;
  getName: (item: any) => string;
  fields: FieldDef[];
  getTpPosition?: (item: any) => { x: number; y: number } | null;
  dragEvent?: string;
  getDragPayload?: (item: any, x: number, y: number) => object;
};

// Section groupée deux niveaux (ex: Créatures, Ressources)
type GroupedSectionConfig = {
  id: string;
  title: string;
  fetchGroupsPath: string | null;         // null → groupes dérivés des instances
  fetchInstancesPath: string;
  deriveGroups?: (instances: any[]) => any[];

  getGroupKey:  (g: any) => string;
  getGroupName: (g: any) => string;
  groupFields:  FieldDef[];
  groupSaveEvent?:      string;
  getGroupSavePayload?: (g: any, fields: Record<string, number>) => object;
  dragEvent?:           string;
  getDragPayload?:      (g: any, x: number, y: number) => object;

  getInstancesForGroup: (instances: any[], group: any) => any[];
  getInstanceKey:  (i: any) => string;
  getInstanceName: (i: any) => string;
  getInstanceBadge?: (i: any) => string;
  instanceFields:  FieldDef[];
  instanceSaveEvent: string;
  getInstanceSavePayload: (i: any, fields: Record<string, number>) => object;
  getInstanceTpPosition?: (i: any) => { x: number; y: number } | null;
  instanceDeleteEvent?:      string;
  getInstanceDeletePayload?: (i: any) => object;
};

type GameWindow = Window &
  typeof globalThis & {
    game?: {
      socket?: { connected?: boolean; emit: (e: string, p: unknown, cb?: (r: unknown) => void) => void };
      scene?: { getScene?: (k: string) => any };
    };
  };

// ── Configs ────────────────────────────────────────────────────────────────────

const GROUPED_SECTION_CONFIGS: GroupedSectionConfig[] = [
  {
    id: "creatures",
    title: "Créatures",
    fetchGroupsPath: "/admin/templates",
    fetchInstancesPath: "/admin/animals",

    getGroupKey:  (t) => t.key,
    getGroupName: (t) => t.name,
    groupFields: [
      { key: "baseHealth",       label: "PV",     min: 1 },
      { key: "baseAttack",       label: "ATK",    min: 0 },
      { key: "baseArmor",        label: "ARM",    min: 0 },
      { key: "aggroRadius",      label: "Aggro",  min: 0 },
      { key: "fleeThresholdPct", label: "Fuite%", min: 0 },
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
      { key: "health", label: "HP", min: 0 },
      { key: "x",      label: "X",  min: 0 },
      { key: "y",      label: "Y",  min: 0 },
    ],
    instanceSaveEvent: "admin:update_animal",
    getInstanceSavePayload: (a, fields) => ({ id: a.id, fields }),
    getInstanceTpPosition: (a) => ({ x: a.x, y: a.y }),
    instanceDeleteEvent: "admin:delete_animal",
    getInstanceDeletePayload: (a) => ({ id: a.id }),
  },
  {
    id: "resources",
    title: "Ressources",
    fetchGroupsPath: null,
    fetchInstancesPath: "/admin/resources",
    deriveGroups: (resources) => {
      const types = [...new Set<string>(resources.map((r: any) => r.type))].sort();
      return types.map((type) => ({ type }));
    },

    getGroupKey:  (g) => g.type,
    getGroupName: (g) => g.type,
    groupFields: [],
    dragEvent: "admin:spawn_resource",
    getDragPayload: (g, x, y) => ({ type: g.type, x, y }),

    getInstancesForGroup: (resources, group) =>
      resources.filter((r) => r.type === group.type),
    getInstanceKey:  (r) => r.id,
    getInstanceName: (r) => r.id.slice(0, 8),
    getInstanceBadge: (r) => r.state,
    instanceFields: [
      { key: "x",              label: "X",     min: 0 },
      { key: "y",              label: "Y",     min: 0 },
      { key: "remainingLoots", label: "Loots", min: 0 },
    ],
    instanceSaveEvent: "admin:update_resource",
    getInstanceSavePayload: (r, fields) => ({ id: r.id, fields }),
    getInstanceTpPosition: (r) => r.state === "alive" ? { x: r.x, y: r.y } : null,
    instanceDeleteEvent: "admin:delete_resource",
    getInstanceDeletePayload: (r) => ({ id: r.id }),
  },
];

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

// ── Drag-to-map ────────────────────────────────────────────────────────────────

function toWorldPoint(clientX: number, clientY: number): { x: number; y: number } | null {
  const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const scene = (window as GameWindow).game?.scene?.getScene?.("WorldScene");
  if (!scene?.cameras?.main) return null;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return scene.cameras.main.getWorldPoint(
    (clientX - rect.left) * scaleX,
    (clientY - rect.top)  * scaleY,
  ) as { x: number; y: number };
}

function startDrag(e: React.MouseEvent, label: string, onDrop: (x: number, y: number) => void) {
  e.preventDefault();
  const ghost = document.createElement("div");
  ghost.className = "admin-drag-ghost";
  ghost.textContent = label;
  document.body.appendChild(ghost);
  document.body.style.userSelect = "none";
  document.body.style.cursor = "grabbing";

  function onMove(me: MouseEvent) {
    ghost.style.left = `${me.clientX + 14}px`;
    ghost.style.top  = `${me.clientY + 14}px`;
    const wp = toWorldPoint(me.clientX, me.clientY);
    ghost.classList.toggle("admin-drag-ghost--valid", wp !== null);
    ghost.textContent = wp ? `${label}  →  (${Math.round(wp.x)}, ${Math.round(wp.y)})` : label;
  }

  function onUp(me: MouseEvent) {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    ghost.remove();
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    const wp = toWorldPoint(me.clientX, me.clientY);
    if (wp) onDrop(wp.x, wp.y);
  }

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL as string;

function fetchAdmin<T>(path: string, token: string): Promise<T> {
  return fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<T>; });
}

function getPhaserKeyboard() {
  return (window as GameWindow).game?.scene?.getScene?.("WorldScene")?.input?.keyboard;
}

const kbHandlers = {
  onFocus: () => { getAdminStore().getState().setConsoleActive(true);  getPhaserKeyboard()?.disableGlobalCapture(); },
  onBlur:  () => { getAdminStore().getState().setConsoleActive(false); getPhaserKeyboard()?.enableGlobalCapture(); },
};

function ackPromise(socket: any, event: string, payload: unknown): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ success: false, message: "Timeout." }), 5000);
    socket.emit(event, payload, (res: any) => {
      clearTimeout(timer);
      resolve(res ?? { success: false, message: "Réponse vide." });
    });
  });
}

function getSocket() { return (window as GameWindow).game?.socket; }

function getAdminCharacterId(): string | null {
  return (window as any).__GLOBAL_CHARACTER_STORE__?.getState?.()?.character?.id ?? null;
}

// ── Réutilisables — gestion de draft ──────────────────────────────────────────

type DraftState = Record<string, Record<string, string>>;

function useDraft(fields: FieldDef[]) {
  const [drafts, setDrafts] = useState<DraftState>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  function getDisplay(key: string, item: any) {
    return drafts[key]?.[item] ?? "";
  }

  function getDisplayField(dk: string, field: string, item: any): string {
    return drafts[dk]?.[field] ?? String(item[field] ?? "");
  }

  function isDirty(dk: string, field: string, item: any): boolean {
    const draft = drafts[dk]?.[field];
    if (draft === undefined || draft === "") return false;
    return Number(draft) !== Number(item[field]);
  }

  function hasAnyDirty(dk: string, item: any): boolean {
    return fields.some(({ key }) => isDirty(dk, key, item));
  }

  function onChange(dk: string, field: string, value: string) {
    setDrafts((prev) => ({ ...prev, [dk]: { ...(prev[dk] ?? {}), [field]: value } }));
  }

  function clearDraft(dk: string) {
    setDrafts((prev) => { const n = { ...prev }; delete n[dk]; return n; });
  }

  function collectDirty(dk: string, item: any): Record<string, number> {
    const result: Record<string, number> = {};
    for (const { key } of fields) {
      if (!isDirty(dk, key, item)) continue;
      const val = Number(drafts[dk]?.[key]);
      if (!isNaN(val) && val >= 0) result[key] = val;
    }
    return result;
  }

  return { drafts, saving, setSaving, getDisplayField, isDirty, hasAnyDirty, onChange, clearDraft, collectDirty };
}

// ── Pagination ─────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 20;

function usePagination(total: number) {
  const [page, setPage]         = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  useEffect(() => { if (page > totalPages) goToPage(totalPages); }, [totalPages]);

  function goToPage(p: number) {
    const c = Math.max(1, Math.min(p, totalPages));
    setPage(c);
    setPageInput(String(c));
  }

  return { page, pageInput, setPageInput, totalPages, goToPage };
}

function PaginationControls({ page, pageInput, setPageInput, totalPages, goToPage }: ReturnType<typeof usePagination>) {
  return (
    <div className="admin-panel__pagination" onClick={(e) => e.stopPropagation()}>
      <button className="admin-panel__pagination-btn" onClick={() => goToPage(page - 1)} disabled={page === 1}>‹</button>
      <input
        className="admin-panel__pagination-input"
        type="number" min={1} max={totalPages}
        value={pageInput}
        onChange={(e) => setPageInput(e.target.value)}
        onBlur={() => goToPage(Number(pageInput))}
        onKeyDown={(e) => { if (e.key === "Enter") goToPage(Number(pageInput)); }}
        {...kbHandlers}
      />
      <span className="admin-panel__pagination-sep">/ {totalPages}</span>
      <button className="admin-panel__pagination-btn" onClick={() => goToPage(page + 1)} disabled={page === totalPages}>›</button>
    </div>
  );
}

// ── EntitySection (section plate — Joueurs) ────────────────────────────────────

type EntitySectionProps = {
  config: SectionConfig;
  items: any[];
  onResult: (text: string, ok: boolean) => void;
};

function EntitySection({ config, items, onResult }: EntitySectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = items.filter((item) =>
    config.getName(item).toLowerCase().includes(search.toLowerCase())
  );
  const pag = usePagination(filtered.length);
  const paginated = filtered.slice((pag.page - 1) * ITEMS_PER_PAGE, pag.page * ITEMS_PER_PAGE);

  useEffect(() => { pag.goToPage(1); }, [search]);

  const draft = useDraft(config.fields);

  async function onTp(item: any) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const pos = config.getTpPosition?.(item);
    if (!pos) return;
    const characterId = getAdminCharacterId();
    if (!characterId) { onResult("Personnage introuvable.", false); return; }
    const result = await ackPromise(socket, "admin:teleport", { characterId, x: pos.x, y: pos.y });
    onResult(result.message, result.success);
  }

  async function onApply(item: any) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const dk = config.getDisplayKey(item);
    const dirtyFields = draft.collectDirty(dk, item);
    if (!Object.keys(dirtyFields).length) return;
    draft.setSaving((prev) => ({ ...prev, [dk]: true }));
    const result = await ackPromise(socket, config.saveEvent, { id: config.getEntityKey(item), fields: dirtyFields });
    draft.setSaving((prev) => ({ ...prev, [dk]: false }));
    onResult(result.message, result.success);
    if (result.success) { Object.assign(item, dirtyFields); draft.clearDraft(dk); }
  }

  return (
    <section className="admin-panel__section">
      <div className="admin-panel__section-header" onClick={() => setIsOpen((o) => !o)}>
        <span className="admin-panel__section-toggle">
          <span className="admin-panel__section-chevron">{isOpen ? "▼" : "▶"}</span>
          {config.title}
        </span>
        {isOpen && <PaginationControls {...pag} />}
      </div>

      {isOpen && (
        <>
          <input className="admin-panel__search" type="text"
            placeholder={`Filtrer ${config.title.toLowerCase()}…`}
            value={search} onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()} {...kbHandlers} spellCheck={false} />

          {items.length === 0 && <p className="admin-panel__loading">Chargement…</p>}
          {items.length > 0 && filtered.length === 0 && <p className="admin-panel__loading">Aucun résultat.</p>}

          <div className="admin-panel__template-list">
            {paginated.map((item) => {
              const dk = config.getDisplayKey(item);
              return (
                <div key={dk} className="admin-panel__template-item">
                  <div className="admin-panel__item-header">
                    {config.dragEvent && (
                      <span className="admin-panel__drag-handle" title="Glisser sur la map"
                        onMouseDown={(e) => startDrag(e, config.getName(item), (x, y) => {
                          const socket = getSocket();
                          if (!socket?.connected || !config.getDragPayload) return;
                          ackPromise(socket, config.dragEvent!, config.getDragPayload(item, Math.round(x), Math.round(y)))
                            .then((r) => onResult(r.message, r.success));
                        })}>⠿</span>
                    )}
                    <span className="admin-panel__template-name">{config.getName(item)}</span>
                    {config.getTpPosition?.(item) && (
                      <button className="admin-panel__tp-btn"
                        title={`Tp (${config.getTpPosition!(item)!.x}, ${config.getTpPosition!(item)!.y})`}
                        onClick={() => onTp(item)}>↓ Tp</button>
                    )}
                  </div>
                  <div className="admin-panel__template-stats">
                    {config.fields.map(({ key, label, min, step }) => (
                      <label key={key} className="admin-panel__template-stat">
                        <span className="admin-panel__template-stat-label">{label}</span>
                        <input
                          className={`admin-panel__template-stat-input${draft.isDirty(dk, key, item) ? " is-dirty" : ""}`}
                          type="number" min={min ?? 0} step={step ?? 1}
                          value={draft.getDisplayField(dk, key, item)}
                          onChange={(e) => draft.onChange(dk, key, e.target.value)}
                          {...kbHandlers} />
                      </label>
                    ))}
                  </div>
                  {draft.hasAnyDirty(dk, item) && (
                    <button className="admin-panel__apply-btn"
                      disabled={!!draft.saving[dk]} onClick={() => onApply(item)}>
                      {draft.saving[dk] ? "…" : "Appliquer"}
                    </button>
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

// ── GroupedSection (créatures, ressources) ─────────────────────────────────────

type GroupedSectionProps = {
  config: GroupedSectionConfig;
  groups: any[];
  instances: any[];
  onResult: (text: string, ok: boolean) => void;
  onInstanceDeleted: (instanceKey: string) => void;
};

function GroupedSection({ config, groups, instances, onResult, onInstanceDeleted }: GroupedSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = groups.filter((g) =>
    config.getGroupName(g).toLowerCase().includes(search.toLowerCase())
  );
  const pag = usePagination(filtered.length);
  const paginated = filtered.slice((pag.page - 1) * ITEMS_PER_PAGE, pag.page * ITEMS_PER_PAGE);

  useEffect(() => { pag.goToPage(1); }, [search]);

  const groupDraft    = useDraft(config.groupFields);
  const instDraft     = useDraft(config.instanceFields);
  const [instDeleting, setInstDeleting] = useState<Record<string, boolean>>({});

  function toggleGroup(key: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function onGroupDrop(group: any, x: number, y: number) {
    const socket = getSocket();
    if (!socket?.connected || !config.dragEvent || !config.getDragPayload) return;
    const result = await ackPromise(socket, config.dragEvent, config.getDragPayload(group, Math.round(x), Math.round(y)));
    onResult(result.message, result.success);
  }

  async function applyGroup(group: any) {
    const socket = getSocket();
    if (!socket?.connected || !config.groupSaveEvent || !config.getGroupSavePayload) return;
    const gk = config.getGroupKey(group);
    const dirtyFields = groupDraft.collectDirty(gk, group);
    if (!Object.keys(dirtyFields).length) return;
    groupDraft.setSaving((prev) => ({ ...prev, [gk]: true }));
    const result = await ackPromise(socket, config.groupSaveEvent, config.getGroupSavePayload(group, dirtyFields));
    groupDraft.setSaving((prev) => ({ ...prev, [gk]: false }));
    onResult(result.message, result.success);
    if (result.success) { Object.assign(group, dirtyFields); groupDraft.clearDraft(gk); }
  }

  async function applyInstance(inst: any) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const ik = config.getInstanceKey(inst);
    const dirtyFields = instDraft.collectDirty(ik, inst);
    if (!Object.keys(dirtyFields).length) return;
    instDraft.setSaving((prev) => ({ ...prev, [ik]: true }));
    const result = await ackPromise(socket, config.instanceSaveEvent, config.getInstanceSavePayload(inst, dirtyFields));
    instDraft.setSaving((prev) => ({ ...prev, [ik]: false }));
    onResult(result.message, result.success);
    if (result.success) { Object.assign(inst, dirtyFields); instDraft.clearDraft(ik); }
  }

  async function deleteInstance(inst: any) {
    const socket = getSocket();
    if (!socket?.connected || !config.instanceDeleteEvent || !config.getInstanceDeletePayload) return;
    const ik = config.getInstanceKey(inst);
    setInstDeleting((prev) => ({ ...prev, [ik]: true }));
    const result = await ackPromise(socket, config.instanceDeleteEvent, config.getInstanceDeletePayload(inst));
    setInstDeleting((prev) => ({ ...prev, [ik]: false }));
    onResult(result.message, result.success);
    if (result.success) onInstanceDeleted(ik);
  }

  async function tpToInstance(inst: any) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const pos = config.getInstanceTpPosition?.(inst);
    if (!pos) return;
    const characterId = getAdminCharacterId();
    if (!characterId) { onResult("Personnage introuvable.", false); return; }
    const result = await ackPromise(socket, "admin:teleport", { characterId, x: pos.x, y: pos.y });
    onResult(result.message, result.success);
  }

  return (
    <section className="admin-panel__section">
      <div className="admin-panel__section-header" onClick={() => setIsOpen((o) => !o)}>
        <span className="admin-panel__section-toggle">
          <span className="admin-panel__section-chevron">{isOpen ? "▼" : "▶"}</span>
          {config.title}
        </span>
        {isOpen && <PaginationControls {...pag} />}
      </div>

      {isOpen && (
        <>
          <input className="admin-panel__search" type="text"
            placeholder={`Filtrer ${config.title.toLowerCase()}…`}
            value={search} onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()} {...kbHandlers} spellCheck={false} />

          {groups.length === 0 && <p className="admin-panel__loading">Chargement…</p>}
          {groups.length > 0 && filtered.length === 0 && <p className="admin-panel__loading">Aucun résultat.</p>}

          <div className="admin-panel__template-list">
            {paginated.map((group) => {
              const gk = config.getGroupKey(group);
              const isExpanded = expanded.has(gk);
              const groupInstances = config.getInstancesForGroup(instances, group);

              return (
                <div key={gk} className="admin-panel__group">
                  {/* ── En-tête du groupe (template) ── */}
                  <div className="admin-panel__group-header">
                    <div className="admin-panel__item-header">
                      {config.dragEvent && (
                        <span className="admin-panel__drag-handle" title="Glisser sur la map"
                          onMouseDown={(e) => startDrag(e, config.getGroupName(group), (x, y) => onGroupDrop(group, x, y))}>⠿</span>
                      )}
                      <span className="admin-panel__group-toggle" onClick={() => toggleGroup(gk)}>
                        <span className="admin-panel__section-chevron">{isExpanded ? "▼" : "▶"}</span>
                        <span className="admin-panel__template-name">{config.getGroupName(group)}</span>
                        <span className="admin-panel__instance-count">({groupInstances.length})</span>
                      </span>
                    </div>

                    {config.groupFields.length > 0 && (
                      <div className="admin-panel__template-stats">
                        {config.groupFields.map(({ key, label, min, step }) => (
                          <label key={key} className="admin-panel__template-stat">
                            <span className="admin-panel__template-stat-label">{label}</span>
                            <input
                              className={`admin-panel__template-stat-input${groupDraft.isDirty(gk, key, group) ? " is-dirty" : ""}`}
                              type="number" min={min ?? 0} step={step ?? 1}
                              value={groupDraft.getDisplayField(gk, key, group)}
                              onChange={(e) => groupDraft.onChange(gk, key, e.target.value)}
                              {...kbHandlers} />
                          </label>
                        ))}
                      </div>
                    )}

                    {groupDraft.hasAnyDirty(gk, group) && (
                      <button className="admin-panel__apply-btn"
                        disabled={!!groupDraft.saving[gk]} onClick={() => applyGroup(group)}>
                        {groupDraft.saving[gk] ? "…" : "Appliquer"}
                      </button>
                    )}
                  </div>

                  {/* ── Liste des instances ── */}
                  {isExpanded && (
                    <div className="admin-panel__instance-list">
                      {groupInstances.length === 0 && (
                        <p className="admin-panel__loading">Aucune instance dans le monde.</p>
                      )}
                      {groupInstances.map((inst) => {
                        const ik = config.getInstanceKey(inst);
                        const badge = config.getInstanceBadge?.(inst);
                        const tpPos = config.getInstanceTpPosition?.(inst);
                        return (
                          <div key={ik} className="admin-panel__instance-item">
                            <div className="admin-panel__item-header">
                              <span className="admin-panel__instance-name">
                                {config.getInstanceName(inst)}
                              </span>
                              {badge && (
                                <span className={`admin-panel__badge admin-panel__badge--${badge}`}>{badge}</span>
                              )}
                              {tpPos && (
                                <button className="admin-panel__tp-btn"
                                  title={`Tp (${tpPos.x}, ${tpPos.y})`}
                                  onClick={() => tpToInstance(inst)}>↓ Tp</button>
                              )}
                              {config.instanceDeleteEvent && (
                                <button className="admin-panel__del-btn"
                                  disabled={!!instDeleting[ik]}
                                  onClick={() => deleteInstance(inst)}>✕</button>
                              )}
                            </div>
                            <div className="admin-panel__template-stats">
                              {config.instanceFields.map(({ key, label, min, step }) => (
                                <label key={key} className="admin-panel__template-stat">
                                  <span className="admin-panel__template-stat-label">{label}</span>
                                  <input
                                    className={`admin-panel__template-stat-input${instDraft.isDirty(ik, key, inst) ? " is-dirty" : ""}`}
                                    type="number" min={min ?? 0} step={step ?? 1}
                                    value={instDraft.getDisplayField(ik, key, inst)}
                                    onChange={(e) => instDraft.onChange(ik, key, e.target.value)}
                                    {...kbHandlers} />
                                </label>
                              ))}
                            </div>
                            {instDraft.hasAnyDirty(ik, inst) && (
                              <button className="admin-panel__apply-btn"
                                disabled={!!instDraft.saving[ik]} onClick={() => applyInstance(inst)}>
                                {instDraft.saving[ik] ? "…" : "Appliquer"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
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

// ── AdminPanel ────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const token = localStorage.getItem("token") ?? "";
  const [overview,      setOverview]      = useState<Overview | null>(null);
  const [sectionData,   setSectionData]   = useState<Record<string, any[]>>({});
  const [groupData,     setGroupData]     = useState<Record<string, any[]>>({});
  const [instanceData,  setInstanceData]  = useState<Record<string, any[]>>({});
  const [error,   setError]   = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [results, setResults] = useState<ConsoleLine[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetches: Promise<any>[] = [
      fetchAdmin<Overview>("/admin/overview", token).then(setOverview),
      ...SECTION_CONFIGS.map((cfg) =>
        fetchAdmin<any[]>(cfg.fetchPath, token).then((data) =>
          setSectionData((prev) => ({ ...prev, [cfg.id]: data }))
        )
      ),
      ...GROUPED_SECTION_CONFIGS.flatMap((cfg) => {
        const f: Promise<any>[] = [
          fetchAdmin<any[]>(cfg.fetchInstancesPath, token).then((data) =>
            setInstanceData((prev) => ({ ...prev, [cfg.id]: data }))
          ),
        ];
        if (cfg.fetchGroupsPath) {
          f.push(
            fetchAdmin<any[]>(cfg.fetchGroupsPath, token).then((data) =>
              setGroupData((prev) => ({ ...prev, [cfg.id]: data }))
            )
          );
        }
        return f;
      }),
    ];
    Promise.all(fetches).catch(() => setError("Impossible de charger les données admin."));
  }, [token]);

  // Dériver les groupes depuis les instances quand pas de fetchGroupsPath
  const resolvedGroups: Record<string, any[]> = {};
  for (const cfg of GROUPED_SECTION_CONFIGS) {
    if (cfg.fetchGroupsPath) {
      resolvedGroups[cfg.id] = groupData[cfg.id] ?? [];
    } else if (cfg.deriveGroups && instanceData[cfg.id]) {
      resolvedGroups[cfg.id] = cfg.deriveGroups(instanceData[cfg.id]);
    } else {
      resolvedGroups[cfg.id] = [];
    }
  }

  function handleInstanceDeleted(sectionId: string, instanceKey: string) {
    setInstanceData((prev) => ({
      ...prev,
      [sectionId]: (prev[sectionId] ?? []).filter(
        (i) => {
          const cfg = GROUPED_SECTION_CONFIGS.find((c) => c.id === sectionId)!;
          return cfg.getInstanceKey(i) !== instanceKey;
        }
      ),
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
      pushResult("Commande destructive — ajoutez --confirm pour l'exécuter.", false);
      return;
    }
    const socket = getSocket();
    if (!socket?.connected) { pushResult("Erreur : socket non connecté.", false); return; }
    const ctx = {
      socket, token,
      getTarget: () => null,
      getCharacterPos: () => null,
      getLastClickedPos: () => getAdminStore().getState().lastClickedPos,
      getTemplateKeys: () => (groupData["creatures"] ?? []).map((t: any) => t.key),
    };
    const result = await def.handler(parsed.args, parsed.flags, ctx);
    pushResult(result.message, result.success);
    getAdminStore().getState().addToHistory(raw.trim());
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
    if (e.key === "ArrowUp")   { e.preventDefault(); setCommand(getAdminStore().getState().navigateHistory("up",   command)); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCommand(getAdminStore().getState().navigateHistory("down", command)); return; }
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
      {/* Console */}
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
            <div key={i} className={`admin-panel__result admin-panel__result--${r.ok ? "ok" : "err"}`}>
              {r.text}
            </div>
          ))}
        </div>
      )}

      {error && <p className="admin-panel__error">{error}</p>}

      {/* Vue d'ensemble */}
      {overview && (
        <section className="admin-panel__section">
          <h3 className="admin-panel__section-title">Vue d&apos;ensemble</h3>
          <div className="admin-panel__overview">
            <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.templates}</span><span className="admin-panel__stat-label">Templates</span></div>
            <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.spawns}</span><span className="admin-panel__stat-label">Spawns</span></div>
            <div className="admin-panel__stat"><span className="admin-panel__stat-value">{overview.activeAnimals}</span><span className="admin-panel__stat-label">Animaux actifs</span></div>
          </div>
        </section>
      )}

      {/* Sections groupées (créatures, ressources) */}
      {GROUPED_SECTION_CONFIGS.map((cfg) => (
        <GroupedSection
          key={cfg.id}
          config={cfg}
          groups={resolvedGroups[cfg.id] ?? []}
          instances={instanceData[cfg.id] ?? []}
          onResult={pushResult}
          onInstanceDeleted={(ik) => handleInstanceDeleted(cfg.id, ik)}
        />
      ))}

      {/* Sections plates (joueurs) */}
      {SECTION_CONFIGS.map((cfg) => (
        <EntitySection
          key={cfg.id}
          config={cfg}
          items={sectionData[cfg.id] ?? []}
          onResult={pushResult}
        />
      ))}
    </div>
  );
}
