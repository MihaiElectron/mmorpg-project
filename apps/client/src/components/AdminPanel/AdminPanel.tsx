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
};

type GameWindow = Window &
  typeof globalThis & {
    game?: {
      socket?: { connected?: boolean; emit: (e: string, p: unknown, cb?: (r: unknown) => void) => void };
      scene?: { getScene?: (k: string) => any };
    };
  };

// ── Section configs ────────────────────────────────────────────────────────────

const SECTION_CONFIGS: SectionConfig[] = [
  {
    id: "creatures",
    title: "Créatures",
    fetchPath: "/admin/templates",
    saveEvent: "admin:update_template",
    getEntityKey: (t) => t.key,
    getDisplayKey: (t) => t.key,
    getName: (t) => t.name,
    fields: [
      { key: "baseHealth",       label: "PV",     min: 1 },
      { key: "baseAttack",       label: "ATK",    min: 0 },
      { key: "baseArmor",        label: "ARM",    min: 0 },
      { key: "aggroRadius",      label: "Aggro",  min: 0 },
      { key: "fleeThresholdPct", label: "Fuite%", min: 0 },
    ],
    getTpPosition: (t) => t.spawnX != null ? { x: t.spawnX, y: t.spawnY } : null,
  },
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
  },
  {
    id: "resources",
    title: "Ressources",
    fetchPath: "/admin/resources",
    saveEvent: "admin:update_resource",
    getEntityKey: (r) => r.id,
    getDisplayKey: (r) => r.id,
    getName: (r) => r.type,
    fields: [
      { key: "x",              label: "X",     min: 0 },
      { key: "y",              label: "Y",     min: 0 },
      { key: "remainingLoots", label: "Loots", min: 0 },
    ],
    getTpPosition: (r) => (r.x != null && r.y != null ? { x: r.x, y: r.y } : null),
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
  // Convertir CSS px → pixels internes Phaser (ratio ≠ 1 en mode EXPAND ou sur écran HiDPI)
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return scene.cameras.main.getWorldPoint(
    (clientX - rect.left) * scaleX,
    (clientY - rect.top)  * scaleY,
  ) as { x: number; y: number };
}

function startDrag(
  e: React.MouseEvent,
  label: string,
  onDrop: (x: number, y: number) => void,
) {
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
    ghost.textContent = wp
      ? `${label}  →  (${Math.round(wp.x)}, ${Math.round(wp.y)})`
      : label;
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

// ── EntitySection ──────────────────────────────────────────────────────────────

type EntitySectionProps = {
  config: SectionConfig;
  items: any[];
  onResult: (text: string, ok: boolean) => void;
};

const ITEMS_PER_PAGE = 20;

function EntitySection({ config, items, onResult }: EntitySectionProps) {
  const [isOpen,     setIsOpen]     = useState(false);
  const [search,     setSearch]     = useState("");
  const [page,       setPage]       = useState(1);
  const [pageInput,  setPageInput]  = useState("1");
  const [drafts,     setDrafts]     = useState<Record<string, Record<string, string>>>({});
  const [saving,     setSaving]     = useState<Record<string, boolean>>({});

  const filtered   = items.filter((item) =>
    config.getName(item).toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => { setPage(1); setPageInput("1"); }, [search]);
  useEffect(() => {
    if (page > totalPages) goToPage(totalPages);
  }, [totalPages]);

  function goToPage(p: number) {
    const clamped = Math.max(1, Math.min(p, totalPages));
    setPage(clamped);
    setPageInput(String(clamped));
  }

  function getDisplay(item: any, field: string): string {
    return drafts[config.getDisplayKey(item)]?.[field] ?? String(item[field] ?? "");
  }

  function isDirty(item: any, field: string): boolean {
    const draft = drafts[config.getDisplayKey(item)]?.[field];
    if (draft === undefined || draft === "") return false;
    return Number(draft) !== Number(item[field]);
  }

  function hasAnyDirty(item: any): boolean {
    return config.fields.some(({ key }) => isDirty(item, key));
  }

  function onChange(item: any, field: string, value: string) {
    const dk = config.getDisplayKey(item);
    setDrafts((prev) => ({ ...prev, [dk]: { ...(prev[dk] ?? {}), [field]: value } }));
  }

  async function onTp(item: any) {
    const socket = (window as GameWindow).game?.socket;
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const pos = config.getTpPosition?.(item);
    if (!pos) return;
    const characterId = (window as any).__GLOBAL_CHARACTER_STORE__?.getState?.()?.character?.id;
    if (!characterId) { onResult("Personnage introuvable.", false); return; }
    const result = await ackPromise(socket, "admin:teleport", { characterId, x: pos.x, y: pos.y });
    onResult(result.message, result.success);
  }

  async function onMapDrop(item: any, x: number, y: number) {
    const socket = (window as GameWindow).game?.socket;
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }

    let result: { success: boolean; message: string };

    if (config.id === "creatures") {
      result = await ackPromise(socket, "admin:spawn", {
        templateKey: config.getEntityKey(item),
        x: Math.round(x),
        y: Math.round(y),
      });
    } else if (config.id === "players") {
      result = await ackPromise(socket, "admin:teleport", {
        characterId: config.getEntityKey(item),
        x: Math.round(x),
        y: Math.round(y),
      });
    } else if (config.id === "resources") {
      result = await ackPromise(socket, "admin:spawn_resource", {
        type: item.type,
        x: Math.round(x),
        y: Math.round(y),
      });
    } else {
      return;
    }

    onResult(result.message, result.success);
  }

  async function onApply(item: any) {
    const socket = (window as GameWindow).game?.socket;
    if (!socket?.connected) { onResult("Erreur : socket non connecté.", false); return; }

    const dirtyFields: Record<string, number> = {};
    for (const { key } of config.fields) {
      if (!isDirty(item, key)) continue;
      const val = Number(drafts[config.getDisplayKey(item)]?.[key]);
      if (!isNaN(val) && val >= 0) dirtyFields[key] = val;
    }
    if (!Object.keys(dirtyFields).length) return;

    const dk = config.getDisplayKey(item);
    setSaving((prev) => ({ ...prev, [dk]: true }));

    const result = await ackPromise(socket, config.saveEvent, {
      ...(config.saveEvent === "admin:update_template"
        ? { key: config.getEntityKey(item) }
        : { id: config.getEntityKey(item) }),
      fields: dirtyFields,
    });

    setSaving((prev) => ({ ...prev, [dk]: false }));
    onResult(result.message, result.success);

    if (result.success) {
      Object.assign(item, dirtyFields);
      setDrafts((prev) => { const n = { ...prev }; delete n[dk]; return n; });
    }
  }

  return (
    <section className="admin-panel__section">

      {/* Header cliquable */}
      <div className="admin-panel__section-header" onClick={() => setIsOpen((o) => !o)}>
        <span className="admin-panel__section-toggle">
          <span className="admin-panel__section-chevron">{isOpen ? "▼" : "▶"}</span>
          {config.title}
        </span>

        {isOpen && (
          <div className="admin-panel__pagination" onClick={(e) => e.stopPropagation()}>
            <button
              className="admin-panel__pagination-btn"
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
            >‹</button>
            <input
              className="admin-panel__pagination-input"
              type="number"
              min={1}
              max={totalPages}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => goToPage(Number(pageInput))}
              onKeyDown={(e) => { if (e.key === "Enter") goToPage(Number(pageInput)); }}
              {...kbHandlers}
            />
            <span className="admin-panel__pagination-sep">/ {totalPages}</span>
            <button
              className="admin-panel__pagination-btn"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
            >›</button>
          </div>
        )}
      </div>

      {/* Corps déroulable */}
      {isOpen && (
        <>
          <input
            className="admin-panel__search"
            type="text"
            placeholder={`Filtrer ${config.title.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            {...kbHandlers}
            spellCheck={false}
          />

          {items.length === 0 && <p className="admin-panel__loading">Chargement…</p>}
          {items.length > 0 && filtered.length === 0 && <p className="admin-panel__loading">Aucun résultat.</p>}

          <div className="admin-panel__template-list">
            {paginated.map((item) => (
              <div key={config.getDisplayKey(item)} className="admin-panel__template-item">
                <div className="admin-panel__item-header">
                  <span
                    className="admin-panel__drag-handle"
                    title="Glisser sur la map"
                    onMouseDown={(e) =>
                      startDrag(e, config.getName(item), (x, y) => onMapDrop(item, x, y))
                    }
                  >⠿</span>
                  <span className="admin-panel__template-name">{config.getName(item)}</span>
                  {config.getTpPosition?.(item) && (
                    <button
                      className="admin-panel__tp-btn"
                      title={`Téléporter ici (${config.getTpPosition!(item)!.x}, ${config.getTpPosition!(item)!.y})`}
                      onClick={() => onTp(item)}
                    >↓ Tp</button>
                  )}
                </div>
                <div className="admin-panel__template-stats">
                  {config.fields.map(({ key, label, min, step }) => (
                    <label key={key} className="admin-panel__template-stat">
                      <span className="admin-panel__template-stat-label">{label}</span>
                      <input
                        className={`admin-panel__template-stat-input${isDirty(item, key) ? " is-dirty" : ""}`}
                        type="number"
                        min={min ?? 0}
                        step={step ?? 1}
                        value={getDisplay(item, key)}
                        onChange={(e) => onChange(item, key, e.target.value)}
                        {...kbHandlers}
                      />
                    </label>
                  ))}
                </div>
                {hasAnyDirty(item) && (
                  <button
                    className="admin-panel__apply-btn"
                    disabled={!!saving[config.getDisplayKey(item)]}
                    onClick={() => onApply(item)}
                  >
                    {saving[config.getDisplayKey(item)] ? "…" : "Appliquer"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ── AdminPanel ────────────────────────────────────────────────────────────────

export default function AdminPanel() {
  const token = localStorage.getItem("token") ?? "";
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sectionData, setSectionData] = useState<Record<string, any[]>>({});
  const [error,   setError]   = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [results, setResults] = useState<ConsoleLine[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetches = [
      fetchAdmin<Overview>("/admin/overview", token).then((ov) => setOverview(ov)),
      ...SECTION_CONFIGS.map((cfg) =>
        fetchAdmin<any[]>(cfg.fetchPath, token).then((data) =>
          setSectionData((prev) => ({ ...prev, [cfg.id]: data }))
        )
      ),
    ];
    Promise.all(fetches).catch(() => setError("Impossible de charger les données admin."));
  }, [token]);

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
    const socket = (window as GameWindow).game?.socket;
    if (!socket?.connected) { pushResult("Erreur : socket non connecté.", false); return; }
    const ctx = {
      socket, token,
      getTarget: () => null,
      getCharacterPos: () => null,
      getLastClickedPos: () => getAdminStore().getState().lastClickedPos,
      getTemplateKeys: () => (sectionData["creatures"] ?? []).map((t: any) => t.key),
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

      {/* Sections génériques */}
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
