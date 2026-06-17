import { useEffect, useState, useRef } from "react";
import { getAdminStore } from "../../store/admin.store";
import { parseCommand } from "../../phaser/admin/commandParser";
import { commandRegistry, autocompleteCommand } from "../../phaser/admin/commandRegistry";

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

type Overview = {
  templates: number;
  spawns: number;
  activeAnimals: number;
};

type ConsoleLine = { text: string; ok: boolean };

type GameWindow = Window &
  typeof globalThis & {
    game?: {
      socket?: { connected?: boolean; emit: (e: string, p: unknown, cb?: (r: unknown) => void) => void };
      scene?: { getScene?: (k: string) => any };
    };
  };

const API = import.meta.env.VITE_API_URL as string;

function fetchAdmin<T>(path: string, token: string): Promise<T> {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json() as Promise<T>;
  });
}

function getPhaserKeyboard() {
  return (window as GameWindow).game?.scene?.getScene?.("WorldScene")?.input?.keyboard;
}

export default function AdminPanel() {
  const token = localStorage.getItem("token") ?? "";
  const [overview, setOverview] = useState<Overview | null>(null);
  const [templates, setTemplates] = useState<CreatureTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const [results, setResults] = useState<ConsoleLine[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetchAdmin<Overview>("/admin/overview", token),
      fetchAdmin<CreatureTemplate[]>("/admin/templates", token),
    ])
      .then(([ov, tpl]) => { setOverview(ov); setTemplates(tpl); })
      .catch(() => setError("Impossible de charger les données admin."));
  }, [token]);

  function onFocus() {
    getAdminStore().getState().setConsoleActive(true);
    getPhaserKeyboard()?.disableGlobalCapture();
  }

  function onBlur() {
    getAdminStore().getState().setConsoleActive(false);
    getPhaserKeyboard()?.enableGlobalCapture();
  }

  function pushResult(text: string, ok: boolean) {
    setResults((prev) => [{ text, ok }, ...prev].slice(0, 5));
  }

  async function runCommand(raw: string) {
    const parsed = parseCommand(raw.trim());
    if (!parsed) {
      pushResult("Syntaxe invalide — commencez par '/'.", false);
      return;
    }

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
    if (!socket?.connected) {
      pushResult("Erreur : socket non connecté.", false);
      return;
    }

    const ctx = {
      socket,
      token,
      getTarget: () => null,
      getCharacterPos: () => null,
      getLastClickedPos: () => getAdminStore().getState().lastClickedPos,
      getTemplateKeys: () => templates.map((t) => t.key),
    };

    const result = await def.handler(parsed.args, parsed.flags, ctx);
    pushResult(result.message, result.success);
    getAdminStore().getState().addToHistory(raw.trim());
  }

  async function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = command.trim();
      if (!cmd) return;
      setCommand("");
      await runCommand(cmd);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCommand(getAdminStore().getState().navigateHistory("up", command));
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCommand(getAdminStore().getState().navigateHistory("down", command));
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const parts = command.split(/\s+/);
      if (parts.length === 1 && parts[0].startsWith("/")) {
        const suggestions = autocompleteCommand(parts[0].slice(1));
        if (suggestions.length === 1) {
          setCommand(suggestions[0] + " ");
        } else if (suggestions.length > 1) {
          pushResult(`Suggestions : ${suggestions.join("  ")}`, true);
        }
      }
      return;
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
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {results.length > 0 && (
        <div className="admin-panel__results">
          {results.map((r, i) => (
            <div
              key={i}
              className={`admin-panel__result admin-panel__result--${r.ok ? "ok" : "err"}`}
            >
              {r.text}
            </div>
          ))}
        </div>
      )}

      {error && <p className="admin-panel__error">{error}</p>}

      {overview && (
        <section className="admin-panel__section">
          <h3 className="admin-panel__section-title">Vue d&apos;ensemble</h3>
          <div className="admin-panel__overview">
            <div className="admin-panel__stat">
              <span className="admin-panel__stat-value">{overview.templates}</span>
              <span className="admin-panel__stat-label">Templates</span>
            </div>
            <div className="admin-panel__stat">
              <span className="admin-panel__stat-value">{overview.spawns}</span>
              <span className="admin-panel__stat-label">Spawns</span>
            </div>
            <div className="admin-panel__stat">
              <span className="admin-panel__stat-value">{overview.activeAnimals}</span>
              <span className="admin-panel__stat-label">Animaux actifs</span>
            </div>
          </div>
        </section>
      )}

      <section className="admin-panel__section">
        <h3 className="admin-panel__section-title">Créatures</h3>
        {templates.length === 0 && !error && (
          <p className="admin-panel__loading">Chargement…</p>
        )}
        <div className="admin-panel__template-list">
          {templates.map((t) => (
            <div key={t.id} className="admin-panel__template-item">
              <span className="admin-panel__template-name">{t.name}</span>
              <div className="admin-panel__template-stats">
                <span className="admin-panel__template-stat">
                  <span>PV</span><span>{t.baseHealth}</span>
                </span>
                <span className="admin-panel__template-stat">
                  <span>ATK</span><span>{t.baseAttack}</span>
                </span>
                <span className="admin-panel__template-stat">
                  <span>Aggro</span><span>{t.aggroRadius}</span>
                </span>
                <span className="admin-panel__template-stat">
                  <span>Fuite</span><span>{t.fleeThresholdPct}%</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
