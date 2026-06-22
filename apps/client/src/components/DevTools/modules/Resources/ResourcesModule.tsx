import { useEffect, useState } from "react";
import "./ResourcesModule.scss";

// Matches ResourceWorldObject from the backend adapter (read-only).
interface ResourcePosition {
  worldX: number;
  worldY: number;
}

interface ResourceWO {
  kind: "entity";
  category: "resource";
  id: string;
  type: string;
  mapId: number | null;
  position: ResourcePosition | null;
  state: "alive" | "dead";
  remainingLoots: number;
  capabilities: string[];
  metadata: {
    legacy: { x: number; y: number } | null;
  };
}

const API = import.meta.env.VITE_API_URL as string;

function fetchWorldObjects(token: string): Promise<ResourceWO[]> {
  return fetch(`${API}/admin/resources/world-objects`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<ResourceWO[]>;
  });
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + "…" : id;
}

function formatPos(position: ResourcePosition | null): string {
  if (!position) return "-";
  return `${position.worldX} / ${position.worldY}`;
}

interface ResourceRowProps {
  wo: ResourceWO;
}

function ResourceRow({ wo }: ResourceRowProps) {
  return (
    <li className="devtools-resources__row" aria-label={`Resource ${wo.type}`}>
      <div className="devtools-resources__cell-main">
        <span className="devtools-resources__type">{wo.type}</span>
        <span className="devtools-resources__id">{shortId(wo.id)}</span>
      </div>
      <span className="devtools-resources__pos">
        {formatPos(wo.position)}
      </span>
      <span className="devtools-resources__loots">
        {wo.remainingLoots}
        <span className="devtools-resources__caps"> /{wo.capabilities.length}cap</span>
      </span>
      <span
        className={`devtools-resources__badge devtools-resources__badge--${wo.state}`}
      >
        {wo.state}
      </span>
    </li>
  );
}

export default function ResourcesModule() {
  const [items, setItems] = useState<ResourceWO[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "loaded">("loading");

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
            <ResourceRow key={wo.id} wo={wo} />
          ))}
        </ul>
      )}
    </section>
  );
}
