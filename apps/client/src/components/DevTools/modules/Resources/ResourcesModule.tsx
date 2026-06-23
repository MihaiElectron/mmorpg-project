import { useEffect, useState } from "react";
import { useDevToolsStore, getDevToolsStore } from "../../../../store/devtools.store";
import { getDevToolsSocket } from "../../devtoolsBridge";
import type { WorldObject } from "../../types/worldObject.types";
import { patchClientWorldObject } from "./resourceWorldObjectClientAdapter";
import "./ResourcesModule.scss";

const API = import.meta.env.VITE_API_URL as string;

function fetchWorldObjects(token: string): Promise<WorldObject[]> {
  return fetch(`${API}/admin/resources/world-objects`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<WorldObject[]>;
  });
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + "…" : id;
}

function formatPos(position: WorldObject["position"]): string {
  if (!position) return "-";
  return `${position.worldX} / ${position.worldY}`;
}

interface ResourceRowProps {
  wo: WorldObject;
  isSelected: boolean;
  onSelect: (wo: WorldObject) => void;
}

function ResourceRow({ wo, isSelected, onSelect }: ResourceRowProps) {
  const rowClass =
    "devtools-resources__row" +
    (isSelected ? " devtools-resources__row--selected" : "");

  return (
    <li
      className={rowClass}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Resource ${wo.type}`}
      onClick={() => onSelect(wo)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(wo);
        }
      }}
    >
      <div className="devtools-resources__cell-main">
        <span className="devtools-resources__type">{wo.type}</span>
        <span className="devtools-resources__id">{shortId(wo.id)}</span>
      </div>
      <span className="devtools-resources__pos">{formatPos(wo.position)}</span>
      <span className="devtools-resources__loots">
        {wo.remainingLoots ?? "-"}
        <span className="devtools-resources__caps">
          {" "}
          /{wo.capabilities.length}cap
        </span>
      </span>
      <span className={`devtools-resources__badge devtools-resources__badge--${wo.state}`}>
        {wo.state}
      </span>
    </li>
  );
}

export default function ResourcesModule() {
  const [items, setItems] = useState<WorldObject[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "loaded">("loading");

  const selectedId = useDevToolsStore((s) => s.selectedWorldObject?.id ?? null);
  const setSelected = useDevToolsStore((s) => s.setSelectedWorldObject);

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("token") ?? "";
    setStatus("loading");
    fetchWorldObjects(token)
      .then((data) => {
        setItems(data);
        setStatus("loaded");
      })
      .catch(() => setStatus("error"));
  }, []);

  // ── Synchronisation runtime via resource_update ───────────────────────────
  useEffect(() => {
    const socket = getDevToolsSocket();
    if (!socket?.on) return;

    function onResourceUpdate(data: Record<string, any>) {
      setItems((prev) => {
        const idx = prev.findIndex((wo) => wo.id === data.id);
        if (idx < 0) return prev;

        const updated = patchClientWorldObject(prev[idx], data);
        const next = [...prev];
        next[idx] = updated;

        // Propager au store si cette resource est actuellement sélectionnée
        const storeState = getDevToolsStore().getState();
        if (storeState.selectedWorldObject?.id === data.id) {
          storeState.setSelectedWorldObject(updated);
        }

        return next;
      });
    }

    socket.on("resource_update", onResourceUpdate);
    return () => {
      socket.off?.("resource_update", onResourceUpdate);
    };
  }, []);

  return (
    <section className="devtools-resources" aria-label="Resources Studio module">
      <div className="devtools-resources__header">
        <h3 className="devtools-resources__title">Resources (WOM)</h3>
        {status === "loading" && (
          <p className="devtools-resources__status">Chargement…</p>
        )}
        {status === "error" && (
          <p className="devtools-resources__status devtools-resources__status--error">
            Impossible de charger les resources.
          </p>
        )}
        {status === "loaded" && items.length === 0 && (
          <p className="devtools-resources__status">Aucune resource.</p>
        )}
        {status === "loaded" && items.length > 0 && (
          <span className="devtools-resources__count">
            {items.length} resource{items.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {status === "loaded" && items.length > 0 && (
        <ul className="devtools-resources__list" aria-label="Resource list">
          {items.map((wo) => (
            <ResourceRow
              key={wo.id}
              wo={wo}
              isSelected={selectedId === wo.id}
              onSelect={setSelected}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
