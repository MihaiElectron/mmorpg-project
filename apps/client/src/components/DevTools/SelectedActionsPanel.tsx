import { useState } from "react";
import { useDevToolsStore } from "../../store/devtools.store";
import { actionRegistry } from "../../studio/sdk/actions";
import type { StudioCommandContext } from "./commands/studioCommands";
import type { StudioAction } from "../../studio/sdk/actions";
import "./SelectedActionsPanel.scss";

export default function SelectedActionsPanel() {
  const obj = useDevToolsStore((s) => s.selectedWorldObject);
  const clearSelectedWorldObject = useDevToolsStore((s) => s.clearSelectedWorldObject);
  const incrementResourcesRefreshKey = useDevToolsStore((s) => s.incrementResourcesRefreshKey);
  const incrementAnimalsRefreshKey = useDevToolsStore((s) => s.incrementAnimalsRefreshKey);
  const incrementCreatureSpawnsRefreshKey = useDevToolsStore((s) => s.incrementCreatureSpawnsRefreshKey);

  const [pendingId, setPendingId] = useState<string | null>(null);

  if (!obj) return null;

  const actions = actionRegistry.getActionsFor(obj);
  if (actions.length === 0) return null;

  const ctx: StudioCommandContext = {
    clearSelectedWorldObject,
    incrementResourcesRefreshKey,
    incrementAnimalsRefreshKey,
    incrementCreatureSpawnsRefreshKey,
    selectedWorldObjectId: obj.id,
  };

  async function runAction(action: StudioAction) {
    if (pendingId) return;
    setPendingId(action.id);
    try {
      await action.run(obj!, ctx);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="sap" aria-label="Selected actions panel">
      <h3 className="sap__title">Actions</h3>
      <div className="sap__list">
        {actions.map((action) => (
          <button
            key={action.id}
            className={`sap__btn${action.danger ? " sap__btn--danger" : ""}`}
            disabled={!action.enabled(obj) || pendingId !== null}
            onClick={() => runAction(action)}
            title={action.id}
            aria-busy={pendingId === action.id}
          >
            {pendingId === action.id ? "…" : action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
