import { useEffect, useState } from "react";
import { getDevToolsStore } from "../../store/devtools.store";
import { getDevToolsSocket } from "./devtoolsBridge";
import type { WorldObject } from "./types/worldObject.types";
import "./WorldObjectListModule.scss";

const API = import.meta.env.VITE_API_URL as string;

function fetchWorldObjects(url: string, token: string): Promise<WorldObject[]> {
  return fetch(`${API}${url}`, {
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

function formatMetric(wo: WorldObject): string {
  if (wo.remainingLoots != null) return String(wo.remainingLoots);
  if (wo.health != null) return `${wo.health}${wo.maxHealth != null ? `/${wo.maxHealth}` : ""}HP`;
  return "-";
}

interface WorldObjectRowProps {
  wo: WorldObject;
  isSelected: boolean;
  onSelect: (wo: WorldObject) => void;
}

function WorldObjectRow({ wo, isSelected, onSelect }: WorldObjectRowProps) {
  const rowClass =
    "devtools-wo-list__row" +
    (isSelected ? " devtools-wo-list__row--selected" : "");

  return (
    <li
      className={rowClass}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`${wo.category} ${wo.type}`}
      onClick={() => onSelect(wo)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(wo);
        }
      }}
    >
      <div className="devtools-wo-list__cell-main">
        <span className="devtools-wo-list__type">{wo.type}</span>
        <span className="devtools-wo-list__id">{shortId(wo.id)}</span>
      </div>
      <span className="devtools-wo-list__pos">{formatPos(wo.position)}</span>
      <span className="devtools-wo-list__metric">
        {formatMetric(wo)}
        <span className="devtools-wo-list__caps">
          {" "}
          /{wo.capabilities.length}cap
        </span>
      </span>
      <span className={`devtools-wo-list__badge devtools-wo-list__badge--${wo.state}`}>
        {wo.state}
      </span>
    </li>
  );
}

export interface WorldObjectListModuleProps {
  title: string;
  fetchUrl: string;
  socketEvent: string;
  patchFn: (existing: WorldObject, data: Record<string, any>) => WorldObject;
  refreshKey: number;
  overlayEnabled: boolean;
  selectedId: string | null;
  onSelect: (wo: WorldObject) => void;
  onRefresh: () => void;
  onToggleOverlay: () => void;
  onClearSelection: () => void;
}

export function WorldObjectListModule({
  title,
  fetchUrl,
  socketEvent,
  patchFn,
  refreshKey,
  overlayEnabled,
  selectedId,
  onSelect,
  onRefresh,
  onToggleOverlay,
  onClearSelection,
}: WorldObjectListModuleProps) {
  const [items, setItems] = useState<WorldObject[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "loaded">("loading");

  // ── Chargement initial + refresh sur commande ─────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("token") ?? "";
    setStatus("loading");
    fetchWorldObjects(fetchUrl, token)
      .then((data) => {
        setItems(data);
        setStatus("loaded");
      })
      .catch(() => setStatus("error"));
  }, [refreshKey, fetchUrl]);

  // ── Synchronisation runtime via socket ────────────────────────────────────
  useEffect(() => {
    const socket = getDevToolsSocket();
    if (!socket?.on) return;

    function onUpdate(data: Record<string, any>) {
      setItems((prev) => {
        const idx = prev.findIndex((wo) => wo.id === data.id);
        if (idx < 0) return prev;

        const updated = patchFn(prev[idx], data);
        const next = [...prev];
        next[idx] = updated;

        const storeState = getDevToolsStore().getState();
        if (storeState.selectedWorldObject?.id === data.id) {
          storeState.setSelectedWorldObject(updated);
        }

        return next;
      });
    }

    socket.on(socketEvent, onUpdate);
    return () => {
      socket.off?.(socketEvent, onUpdate);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socketEvent]);

  const noun = items.length > 1 ? items.length : items.length === 1 ? 1 : 0;

  return (
    <section className="devtools-wo-list" aria-label={`${title} Studio module`}>
      <div className="devtools-wo-list__header">
        <div className="devtools-wo-list__header-row">
          <h3 className="devtools-wo-list__title">{title}</h3>
          <div className="devtools-wo-list__actions">
            <button
              className={
                "devtools-wo-list__action-btn" +
                (overlayEnabled ? " devtools-wo-list__action-btn--active" : "")
              }
              onClick={onToggleOverlay}
              title={overlayEnabled ? "Désactiver l'overlay" : "Activer l'overlay"}
              aria-label="Overlay"
              aria-pressed={overlayEnabled}
            >
              ◎
            </button>
            <button
              className="devtools-wo-list__action-btn"
              onClick={onRefresh}
              title="Rafraîchir la liste"
              aria-label="Rafraîchir"
            >
              ↺
            </button>
            <button
              className="devtools-wo-list__action-btn"
              onClick={onClearSelection}
              disabled={!selectedId}
              title="Désélectionner"
              aria-label="Désélectionner"
            >
              ✕
            </button>
          </div>
        </div>
        {status === "loading" && (
          <p className="devtools-wo-list__status">Chargement…</p>
        )}
        {status === "error" && (
          <p className="devtools-wo-list__status devtools-wo-list__status--error">
            Impossible de charger la liste.
          </p>
        )}
        {status === "loaded" && items.length === 0 && (
          <p className="devtools-wo-list__status">Aucun élément.</p>
        )}
        {status === "loaded" && noun > 0 && (
          <span className="devtools-wo-list__count">{noun} élément{noun > 1 ? "s" : ""}</span>
        )}
      </div>
      {status === "loaded" && items.length > 0 && (
        <ul className="devtools-wo-list__list" aria-label={`${title} list`}>
          {items.map((wo) => (
            <WorldObjectRow
              key={wo.id}
              wo={wo}
              isSelected={selectedId === wo.id}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
