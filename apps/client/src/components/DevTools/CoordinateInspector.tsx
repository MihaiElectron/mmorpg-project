import { useDevToolsStore } from "../../store/devtools.store";

function formatValue(value: number | string | null | undefined): string {
  return value === null || value === undefined ? "-" : String(value);
}

function CoordinateRow({ label, values }: { label: string; values: Array<[string, number | string | null | undefined]> }) {
  return (
    <div className="admin-panel__result">
      <strong>{label}</strong> {values.map(([key, value]) => `${key}:${formatValue(value)}`).join(" ")}
    </div>
  );
}

export default function CoordinateInspector() {
  const activeTool = useDevToolsStore((s) => s.activeTool);
  const screenPoint = useDevToolsStore((s) => s.lastClickedScreenPoint);
  const worldPoint = useDevToolsStore((s) => s.lastClickedWorldPoint);
  const tilePoint = useDevToolsStore((s) => s.lastClickedTilePoint);
  const chunkPoint = useDevToolsStore((s) => s.lastClickedChunkPoint);

  return (
    <section className="admin-panel__section" aria-label="Coordinate inspector">
      <h3 className="admin-panel__section-title">Coordinates</h3>
      <div className="admin-panel__results">
        <CoordinateRow label="Tool" values={[["active", activeTool]]} />
        <CoordinateRow label="Screen" values={[["x", screenPoint?.x], ["y", screenPoint?.y]]} />
        <CoordinateRow
          label="WU"
          values={[
            ["map", worldPoint?.mapId],
            ["x", worldPoint?.worldX],
            ["y", worldPoint?.worldY],
          ]}
        />
        <CoordinateRow
          label="Tile"
          values={[
            ["map", tilePoint?.mapId],
            ["x", tilePoint?.tileX],
            ["y", tilePoint?.tileY],
          ]}
        />
        <CoordinateRow
          label="Chunk"
          values={[
            ["map", chunkPoint?.mapId],
            ["x", chunkPoint?.chunkX],
            ["y", chunkPoint?.chunkY],
          ]}
        />
      </div>
    </section>
  );
}
