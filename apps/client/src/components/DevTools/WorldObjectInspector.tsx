import { useDevToolsStore } from "../../store/devtools.store";
import "./WorldObjectInspector.scss";

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + "…" : id;
}

function formatPos(position: { worldX: number; worldY: number } | null): string {
  if (!position) return "-";
  return `${position.worldX} / ${position.worldY}`;
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
