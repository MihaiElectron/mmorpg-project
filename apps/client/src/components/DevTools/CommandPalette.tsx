import { useState } from "react";
import { useDevToolsStore } from "../../store/devtools.store";
import { getActionsForWorldObject } from "../../studio/sdk/actions";
import type { StudioAction } from "../../studio/sdk/actions";
import type { StudioCommandContext } from "./commands/studioCommands";
import "./CommandPalette.scss";

/** Filtre les actions par label ou id, case-insensitive. Retourne toutes si query vide. */
export function filterActions(actions: StudioAction[], query: string): StudioAction[] {
  const q = query.trim().toLowerCase();
  if (!q) return actions;
  return actions.filter(
    (a) => a.label.toLowerCase().includes(q) || a.id.toLowerCase().includes(q),
  );
}

export default function CommandPalette() {
  const obj = useDevToolsStore((s) => s.selectedWorldObject);
  const clearSelectedWorldObject = useDevToolsStore((s) => s.clearSelectedWorldObject);
  const incrementResourcesRefreshKey = useDevToolsStore((s) => s.incrementResourcesRefreshKey);
  const incrementAnimalsRefreshKey = useDevToolsStore((s) => s.incrementAnimalsRefreshKey);
  const incrementCreatureSpawnsRefreshKey = useDevToolsStore(
    (s) => s.incrementCreatureSpawnsRefreshKey,
  );

  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const allActions = obj ? getActionsForWorldObject(obj) : [];
  const visible = filterActions(allActions, query);

  const ctx: StudioCommandContext = {
    clearSelectedWorldObject,
    incrementResourcesRefreshKey,
    incrementAnimalsRefreshKey,
    incrementCreatureSpawnsRefreshKey,
    selectedWorldObjectId: obj?.id ?? null,
  };

  async function runAction(action: StudioAction) {
    if (!obj || pendingId) return;
    setPendingId(action.id);
    try {
      await action.run(obj, ctx);
    } finally {
      setPendingId(null);
      setQuery("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && visible.length > 0) {
      e.preventDefault();
      runAction(visible[0]);
    }
  }

  return (
    <section className="cp" aria-label="Command palette">
      <h3 className="cp__title">Command Palette</h3>
      <input
        className="cp__input"
        type="text"
        placeholder={obj ? "Filtrer les actions… (Enter = exécuter)" : "Sélection requise"}
        value={query}
        disabled={!obj || pendingId !== null}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Filtrer les actions"
      />
      {obj && visible.length > 0 && (
        <ul className="cp__list">
          {visible.map((action) => (
            <li key={action.id} className="cp__item">
              <button
                className={`cp__item-btn${action.danger ? " cp__item-btn--danger" : ""}`}
                disabled={!action.enabled(obj) || pendingId !== null}
                onClick={() => runAction(action)}
                aria-busy={pendingId === action.id}
              >
                <span className="cp__item-label">
                  {pendingId === action.id ? "…" : action.label}
                </span>
                <span className="cp__item-id">{action.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {obj && allActions.length > 0 && visible.length === 0 && (
        <p className="cp__empty">Aucune action pour « {query} »</p>
      )}
      {obj && allActions.length === 0 && (
        <p className="cp__empty">Aucune action disponible.</p>
      )}
    </section>
  );
}
