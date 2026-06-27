import { useDevToolsStore } from "../../store/devtools.store";
import "./WorldObjectInspector.scss";

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + "…" : id;
}

function formatPos(position: { worldX: number; worldY: number } | null): string {
  if (!position) return "-";
  return `${position.worldX} / ${position.worldY}`;
}

function metaStr(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === "string" ? v : null;
}

function metaNum(meta: Record<string, unknown>, key: string): number | null {
  const v = meta[key];
  return typeof v === "number" ? v : null;
}

function metaArr(meta: Record<string, unknown>, key: string): string[] | null {
  const v = meta[key];
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === "string") ? (v as string[]) : null;
}

export default function WorldObjectInspector() {
  const obj = useDevToolsStore((s) => s.selectedWorldObject);
  const clear = useDevToolsStore((s) => s.clearSelectedWorldObject);

  return (
    <section className="woi" aria-label="WorldObject Inspector">
      <div className="woi__header">
        <h3 className="woi__title">Inspector</h3>
        {obj && (
          <button className="woi__deselect" onClick={clear} aria-label="Désélectionner">
            ✕
          </button>
        )}
      </div>
      {!obj ? (
        <p className="woi__empty">Aucun WorldObject sélectionné.</p>
      ) : (
        <dl className="woi__grid">
          <dt className="woi__label">kind</dt>
          <dd className="woi__value">{obj.kind}</dd>

          <dt className="woi__label">category</dt>
          <dd className="woi__value woi__value--highlight">{obj.category}</dd>

          <dt className="woi__label">id</dt>
          <dd className="woi__value woi__value--muted" title={obj.id}>
            {shortId(obj.id)}
          </dd>

          <dt className="woi__label">type</dt>
          <dd className="woi__value woi__value--highlight">{obj.type}</dd>

          <dt className="woi__label">state</dt>
          <dd className="woi__value">{obj.state}</dd>

          <dt className="woi__label">mapId</dt>
          <dd className="woi__value">
            {obj.mapId != null ? String(obj.mapId) : "-"}
          </dd>

          <dt className="woi__label">worldX / worldY</dt>
          <dd className="woi__value">{formatPos(obj.position)}</dd>

          {obj.remainingLoots != null && (
            <>
              <dt className="woi__label">remainingLoots</dt>
              <dd className="woi__value">{obj.remainingLoots}</dd>
            </>
          )}

          {obj.health != null && (
            <>
              <dt className="woi__label">health</dt>
              <dd className="woi__value">
                {obj.health}
                {obj.maxHealth != null ? ` / ${obj.maxHealth}` : ""}
              </dd>
            </>
          )}

          {metaStr(obj.metadata, "templateKey") != null && (
            <>
              <dt className="woi__label">templateKey</dt>
              <dd className="woi__value woi__value--muted">{metaStr(obj.metadata, "templateKey")}</dd>
            </>
          )}

          {metaStr(obj.metadata, "templateName") != null && (
            <>
              <dt className="woi__label">templateName</dt>
              <dd className="woi__value">{metaStr(obj.metadata, "templateName")}</dd>
            </>
          )}

          {metaStr(obj.metadata, "itemName") != null && (
            <>
              <dt className="woi__label">item</dt>
              <dd className="woi__value">{metaStr(obj.metadata, "itemName")}</dd>
            </>
          )}

          {metaStr(obj.metadata, "itemId") != null && (
            <>
              <dt className="woi__label">itemId</dt>
              <dd className="woi__value woi__value--muted">{metaStr(obj.metadata, "itemId")}</dd>
            </>
          )}

          {metaNum(obj.metadata, "quantity") != null && (
            <>
              <dt className="woi__label">quantity</dt>
              <dd className="woi__value">{metaNum(obj.metadata, "quantity")}</dd>
            </>
          )}

          {metaStr(obj.metadata, "ownerCharacterId") != null && (
            <>
              <dt className="woi__label">owner</dt>
              <dd className="woi__value woi__value--muted">{metaStr(obj.metadata, "ownerCharacterId")}</dd>
            </>
          )}

          {metaStr(obj.metadata, "expiresAt") != null && (
            <>
              <dt className="woi__label">expiresAt</dt>
              <dd className="woi__value">{metaStr(obj.metadata, "expiresAt")}</dd>
            </>
          )}

          {metaNum(obj.metadata, "patrolRadius") != null && (
            <>
              <dt className="woi__label">patrolRadius</dt>
              <dd className="woi__value">{metaNum(obj.metadata, "patrolRadius")} px</dd>
            </>
          )}

          {metaNum(obj.metadata, "respawnDelayMs") != null && (
            <>
              <dt className="woi__label">respawnDelay</dt>
              <dd className="woi__value">{metaNum(obj.metadata, "respawnDelayMs")} ms</dd>
            </>
          )}

          {metaNum(obj.metadata, "lootPoolCount") != null && (
            <>
              <dt className="woi__label">lootPool</dt>
              <dd className="woi__value">
                {metaNum(obj.metadata, "lootPoolCount")} entrée(s)
                {metaArr(obj.metadata, "lootPoolItems") != null && (
                  <span className="woi__value--muted">
                    {" "}— {metaArr(obj.metadata, "lootPoolItems")!.join(", ") || "∅"}
                  </span>
                )}
              </dd>
            </>
          )}

          <dt className="woi__label">capabilities</dt>
          <dd className="woi__value">
            <ul className="woi__caps" aria-label="Capabilities">
              {obj.capabilities.map((cap) => (
                <li key={cap} className="woi__cap-tag">
                  {cap}
                </li>
              ))}
            </ul>
          </dd>
        </dl>
      )}
    </section>
  );
}
