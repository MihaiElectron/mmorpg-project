/**
 * adminPanel.shared.tsx
 * Utilitaires communs à AdminPanel (legacy) et AdminPanelWOM.
 * Ne contient aucune logique de données — uniquement rendu et helpers.
 */
import { useEffect, useState } from "react";
import { getAdminStore } from "../../store/admin.store";
import { getDevToolsSocket, getMainCamera, getWorldScene } from "../DevTools/devtoolsBridge";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FieldDef = {
  key: string;
  label: string;
  min?: number;
  step?: number;
  options?: string[];
};

export type ConsoleLine = { text: string; ok: boolean };

export type SectionConfig = {
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

export type GroupedSectionConfig = {
  id: string;
  title: string;
  getGroupKey:  (g: any) => string;
  getGroupName: (g: any) => string;
  groupFields:  FieldDef[];
  groupSaveEvent?:      string;
  getGroupSavePayload?: (g: any, fields: Record<string, number | string>) => object;
  dragEvent?:           string;
  getDragPayload?:      (g: any, x: number, y: number) => object;
  getInstancesForGroup: (instances: any[], group: any) => any[];
  getInstanceKey:  (i: any) => string;
  getInstanceName: (i: any) => string;
  getInstanceBadge?: (i: any) => string;
  instanceFields:  FieldDef[];
  instanceSaveEvent: string;
  getInstanceSavePayload: (i: any, fields: Record<string, number | string>) => object;
  getInstanceTpPosition?: (i: any) => { x: number; y: number } | null;
  instanceDeleteEvent?:      string;
  getInstanceDeletePayload?: (i: any) => object;
};

// ── Constantes ────────────────────────────────────────────────────────────────

export const ITEMS_PER_PAGE = 20;

function getPhaserKeyboard() {
  return getWorldScene()?.input?.keyboard;
}

export const kbHandlers = {
  onFocus: () => { getAdminStore().getState().setConsoleActive(true);  getPhaserKeyboard()?.disableGlobalCapture(); },
  onBlur:  () => { getAdminStore().getState().setConsoleActive(false); getPhaserKeyboard()?.enableGlobalCapture(); },
};

// ── Helpers réseau ────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL as string;

export function fetchAdmin<T>(path: string, token: string): Promise<T> {
  return fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<T>; });
}

export function ackPromise(socket: any, event: string, payload: unknown): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ success: false, message: "Timeout." }), 5000);
    socket.emit(event, payload, (res: any) => {
      clearTimeout(timer);
      resolve(res ?? { success: false, message: "Réponse vide." });
    });
  });
}

export function getSocket() { return getDevToolsSocket(); }

export function getAdminCharacterId(): string | null {
  return (window as any).__GLOBAL_CHARACTER_STORE__?.getState?.()?.character?.id ?? null;
}

// ── Drag-to-map ───────────────────────────────────────────────────────────────

export function toWorldPoint(clientX: number, clientY: number): { x: number; y: number } | null {
  const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const camera = getMainCamera();
  if (!camera) return null;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return camera.getWorldPoint(
    (clientX - rect.left) * scaleX,
    (clientY - rect.top)  * scaleY,
  ) as { x: number; y: number };
}

export function startDrag(e: React.MouseEvent, label: string, onDrop: (x: number, y: number) => void) {
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

// ── Hook useDraft ─────────────────────────────────────────────────────────────

type DraftState = Record<string, Record<string, string>>;

export function useDraft(fields: FieldDef[]) {
  const [drafts, setDrafts] = useState<DraftState>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  function getDisplayField(dk: string, field: string, item: any): string {
    return drafts[dk]?.[field] ?? String(item[field] ?? "");
  }

  function isDirty(dk: string, field: string, item: any): boolean {
    const draft = drafts[dk]?.[field];
    if (draft === undefined || draft === "") return false;
    const def = fields.find((f) => f.key === field);
    if (def?.options) return draft !== String(item[field] ?? "");
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

  function collectDirty(dk: string, item: any): Record<string, number | string> {
    const result: Record<string, number | string> = {};
    for (const f of fields) {
      if (!isDirty(dk, f.key, item)) continue;
      const raw = drafts[dk]?.[f.key] ?? "";
      if (f.options) {
        result[f.key] = raw;
      } else {
        const val = Number(raw);
        if (!isNaN(val) && val >= 0) result[f.key] = val;
      }
    }
    return result;
  }

  return { drafts, saving, setSaving, getDisplayField, isDirty, hasAnyDirty, onChange, clearDraft, collectDirty };
}

// ── Hook usePagination ────────────────────────────────────────────────────────

export function usePagination(total: number) {
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

// ── PaginationControls ────────────────────────────────────────────────────────

export function PaginationControls({ page, pageInput, setPageInput, totalPages, goToPage }: ReturnType<typeof usePagination>) {
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

// ── StatField ─────────────────────────────────────────────────────────────────

type StatFieldProps = {
  def: FieldDef;
  dirty: boolean;
  value: string;
  onChange: (v: string) => void;
};

export function StatField({ def, dirty, value, onChange }: StatFieldProps) {
  const cls = `admin-panel__template-stat-input${dirty ? " is-dirty" : ""}`;
  if (def.options) {
    return (
      <select className={cls} value={value} onChange={(e) => onChange(e.target.value)} {...kbHandlers}>
        {def.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }
  return (
    <input className={cls} type="number"
      min={def.min ?? 0} step={def.step ?? 1}
      value={value} onChange={(e) => onChange(e.target.value)}
      {...kbHandlers} />
  );
}

// ── EntitySection ─────────────────────────────────────────────────────────────

type EntitySectionProps = {
  config: SectionConfig;
  items: any[];
  onResult: (text: string, ok: boolean) => void;
};

export function EntitySection({ config, items, onResult }: EntitySectionProps) {
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
                    {config.fields.map((f) => (
                      <label key={f.key} className="admin-panel__template-stat">
                        <span className="admin-panel__template-stat-label">{f.label}</span>
                        <StatField def={f} dirty={draft.isDirty(dk, f.key, item)}
                          value={draft.getDisplayField(dk, f.key, item)}
                          onChange={(v) => draft.onChange(dk, f.key, v)} />
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

// ── GroupedSection ────────────────────────────────────────────────────────────

type GroupedSectionProps = {
  config: GroupedSectionConfig;
  groups: any[];
  instances: any[];
  onResult: (text: string, ok: boolean) => void;
  onInstanceDeleted: (instanceKey: string) => void;
};

export function GroupedSection({ config, groups, instances, onResult, onInstanceDeleted }: GroupedSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = groups.filter((g) =>
    config.getGroupName(g).toLowerCase().includes(search.toLowerCase())
  );
  const pag = usePagination(filtered.length);
  const paginated = filtered.slice((pag.page - 1) * ITEMS_PER_PAGE, pag.page * ITEMS_PER_PAGE);

  useEffect(() => { pag.goToPage(1); }, [search]);

  const groupDraft = useDraft(config.groupFields);
  const instDraft  = useDraft(config.instanceFields);
  const [pendingDelete,  setPendingDelete]  = useState<Record<string, boolean>>({});
  const [instOperating, setInstOperating]  = useState<Record<string, boolean>>({});

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

  function togglePendingDelete(ik: string) {
    setPendingDelete((prev) => ({ ...prev, [ik]: !prev[ik] }));
  }

  async function applyOrDelete(inst: any) {
    const ik = config.getInstanceKey(inst);
    setInstOperating((prev) => ({ ...prev, [ik]: true }));

    if (pendingDelete[ik]) {
      const socket = getSocket();
      if (socket?.connected && config.instanceDeleteEvent && config.getInstanceDeletePayload) {
        const result = await ackPromise(socket, config.instanceDeleteEvent, config.getInstanceDeletePayload(inst));
        onResult(result.message, result.success);
        if (result.success) onInstanceDeleted(ik);
      }
    } else {
      const socket = getSocket();
      if (!socket?.connected) { onResult("Socket non connecté.", false); setInstOperating((prev) => ({ ...prev, [ik]: false })); return; }
      const dirtyFields = instDraft.collectDirty(ik, inst);
      if (Object.keys(dirtyFields).length) {
        const result = await ackPromise(socket, config.instanceSaveEvent, config.getInstanceSavePayload(inst, dirtyFields));
        onResult(result.message, result.success);
        if (result.success) { Object.assign(inst, dirtyFields); instDraft.clearDraft(ik); }
      }
    }

    setInstOperating((prev) => ({ ...prev, [ik]: false }));
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
                        {config.groupFields.map((f) => (
                          <label key={f.key} className="admin-panel__template-stat">
                            <span className="admin-panel__template-stat-label">{f.label}</span>
                            <StatField def={f} dirty={groupDraft.isDirty(gk, f.key, group)}
                              value={groupDraft.getDisplayField(gk, f.key, group)}
                              onChange={(v) => groupDraft.onChange(gk, f.key, v)} />
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
                              <span className="admin-panel__instance-name">{config.getInstanceName(inst)}</span>
                              {badge && (
                                <span className={`admin-panel__badge admin-panel__badge--${badge}`}>{badge}</span>
                              )}
                              {tpPos && (
                                <button className="admin-panel__tp-btn"
                                  title={`Tp (${tpPos.x}, ${tpPos.y})`}
                                  onClick={() => tpToInstance(inst)}>↓ Tp</button>
                              )}
                              {config.instanceDeleteEvent && (
                                <button
                                  className={`admin-panel__del-toggle${pendingDelete[ik] ? " is-active" : ""}`}
                                  title={pendingDelete[ik] ? "Annuler" : "Supprimer"}
                                  onClick={() => togglePendingDelete(ik)}>🗑</button>
                              )}
                            </div>
                            <div className="admin-panel__template-stats">
                              {config.instanceFields.map((f) => (
                                <label key={f.key} className="admin-panel__template-stat">
                                  <span className="admin-panel__template-stat-label">{f.label}</span>
                                  <StatField def={f} dirty={instDraft.isDirty(ik, f.key, inst)}
                                    value={instDraft.getDisplayField(ik, f.key, inst)}
                                    onChange={(v) => instDraft.onChange(ik, f.key, v)} />
                                </label>
                              ))}
                              {(instDraft.hasAnyDirty(ik, inst) || pendingDelete[ik]) && (
                                <button
                                  className={`admin-panel__apply-btn${pendingDelete[ik] ? " admin-panel__apply-btn--danger" : ""}`}
                                  disabled={!!instOperating[ik]}
                                  onClick={() => applyOrDelete(inst)}>
                                  {instOperating[ik] ? "…" : pendingDelete[ik] ? "⚠ Supprimer" : "Appliquer"}
                                </button>
                              )}
                            </div>
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
