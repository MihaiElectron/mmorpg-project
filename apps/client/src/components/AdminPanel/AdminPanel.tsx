import { useEffect, useState, useRef } from "react";
import { getAdminStore } from "../../store/admin.store";
import { parseCommand } from "../../phaser/admin/commandParser";
import { commandRegistry, autocompleteCommand } from "../../phaser/admin/commandRegistry";
import { updateTemplate } from "../../phaser/admin/admin.actions";

type CreatureTemplate = {
  id: number;
  key: string;
  name: string;
  baseHealth: number;
  baseAttack: number;
  baseArmor: number;
  aggroRadius: number;
  fleeThresholdPct: number;
  patrolRadius: number;
  speedMin: number;
  speedMax: number;
};

type Overview = { templates: number; spawns: number; activeAnimals: number };
type ConsoleLine = { text: string; ok: boolean };

type GameWindow = Window &
  typeof globalThis & {
    game?: {
      socket?: { connected?: boolean; emit: (e: string, p: unknown, cb?: (r: unknown) => void) => void };
      scene?: { getScene?: (k: string) => any };
    };
  };

const API = import.meta.env.VITE_API_URL as string;

const STAT_FIELDS: { key: keyof CreatureTemplate; label: string }[] = [
  { key: "baseHealth",       label: "PV"     },
  { key: "baseAttack",       label: "ATK"    },
  { key: "baseArmor",        label: "ARM"    },
  { key: "aggroRadius",      label: "Aggro"  },
  { key: "fleeThresholdPct", label: "Fuite%" },
];

function fetchAdmin<T>(path: string, token: string): Promise<T> {
  return fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
    .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<T>; });
}

function getPhaserKeyboard() {
  return (window as GameWindow).game?.scene?.getScene?.("WorldScene")?.input?.keyboard;
}

const kbHandlers = {
  onFocus: () => { getAdminStore().getState().setConsoleActive(true);  getPhaserKeyboard()?.disableGlobalCapture(); },
  onBlur:  () => { getAdminStore().getState().setConsoleActive(false); getPhaserKeyboard()?.enableGlobalCapture();  },
};

export default function AdminPanel() {
  const token = localStorage.getItem("token") ?? "";
  const [overview,   setOverview]   = useState<Overview | null>(null);
  const [templates,  setTemplates]  = useState<CreatureTemplate[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [command,    setCommand]    = useState("");
  const [results,    setResults]    = useState<ConsoleLine[]>([]);
  const [search,     setSearch]     = useState("");
  // drafts: templateKey → { field → string value }
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  // applying: templateKey → bool
  const [applying, setApplying] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetchAdmin<Overview>("/admin/overview", token),
      fetchAdmin<CreatureTemplate[]>("/admin/templates", token),
    ])
      .then(([ov, tpl]) => { setOverview(ov); setTemplates(tpl); })
      .catch(() => setError("Impossible de charger les données admin."));
  }, [token]);

  // ── Console ───────────────────────────────────────────────────────────────
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
      getTemplateKeys: () => templates.map((t) => t.key),
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

  // ── Édition inline des stats ──────────────────────────────────────────────
  function getDisplayValue(t: CreatureTemplate, field: keyof CreatureTemplate): string {
    return drafts[t.key]?.[field as string] ?? String(t[field]);
  }

  function isDirty(t: CreatureTemplate, field: keyof CreatureTemplate): boolean {
    const draft = drafts[t.key]?.[field as string];
    if (draft === undefined || draft === "") return false;
    // Comparaison numérique explicite
    const draftNum = Number(draft);
    const origNum  = Number(t[field]);
    return !isNaN(draftNum) && draftNum !== origNum;
  }

  function hasAnyDirty(t: CreatureTemplate): boolean {
    return STAT_FIELDS.some(({ key }) => isDirty(t, key));
  }

  function handleStatChange(templateKey: string, field: string, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [templateKey]: { ...(prev[templateKey] ?? {}), [field]: value },
    }));
  }

  async function applyChanges(t: CreatureTemplate) {
    const dirtyFields: Record<string, number> = {};
    for (const { key } of STAT_FIELDS) {
      if (!isDirty(t, key)) continue;
      const val = Number(drafts[t.key]?.[key as string]);
      if (!isNaN(val) && val >= 0) dirtyFields[key as string] = val;
    }
    if (Object.keys(dirtyFields).length === 0) return;

    const socket = (window as GameWindow).game?.socket;
    if (!socket?.connected) { pushResult("Erreur : socket non connecté.", false); return; }

    setApplying((prev) => ({ ...prev, [t.key]: true }));
    const result = await updateTemplate(t.key, dirtyFields, socket);
    setApplying((prev) => ({ ...prev, [t.key]: false }));

    pushResult(result.message, result.success);

    if (result.success) {
      setTemplates((prev) =>
        prev.map((tmpl) => tmpl.key === t.key ? { ...tmpl, ...dirtyFields } : tmpl)
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[t.key];
        return next;
      });
    }
  }

  const filteredTemplates = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

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

      {/* Créatures */}
      <section className="admin-panel__section">
        <h3 className="admin-panel__section-title">Créatures</h3>

        <input
          className="admin-panel__search"
          type="text"
          placeholder="Filtrer… (ex: Tu)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          {...kbHandlers}
          spellCheck={false}
        />

        {filteredTemplates.length === 0 && !error && (
          <p className="admin-panel__loading">
            {templates.length === 0 ? "Chargement…" : "Aucun résultat."}
          </p>
        )}

        <div className="admin-panel__template-list">
          {filteredTemplates.map((t) => (
            <div key={t.id} className="admin-panel__template-item">
              <span className="admin-panel__template-name">{t.name}</span>

              <div className="admin-panel__template-stats">
                {STAT_FIELDS.map(({ key, label }) => (
                  <label key={key as string} className="admin-panel__template-stat">
                    <span className="admin-panel__template-stat-label">{label}</span>
                    <input
                      className={`admin-panel__template-stat-input${isDirty(t, key) ? " is-dirty" : ""}`}
                      type="number"
                      min={0}
                      value={getDisplayValue(t, key)}
                      onChange={(e) => handleStatChange(t.key, key as string, e.target.value)}
                      {...kbHandlers}
                    />
                  </label>
                ))}
              </div>

              {hasAnyDirty(t) && (
                <button
                  className="admin-panel__apply-btn"
                  disabled={!!applying[t.key]}
                  onClick={() => applyChanges(t)}
                >
                  {applying[t.key] ? "…" : "Appliquer"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
