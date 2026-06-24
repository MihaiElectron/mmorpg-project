import { useDevToolsStore } from "../../../../store/devtools.store";

function formatValue(value: number | string | null | undefined): string {
  return value === null || value === undefined ? "-" : String(value);
}

function CoordinateRow({
  label,
  values,
}: {
  label: string;
  values: Array<[string, number | string | null | undefined]>;
}) {
  return (
    <div className="devtools-world__coordinate-row">
      <strong className="devtools-world__coordinate-label">{label}</strong>
      <span className="devtools-world__coordinate-value">
        {values.map(([key, value]) => `${key}:${formatValue(value)}`).join(" ")}
      </span>
    </div>
  );
}

export default function CoordinateInspector() {
  const activeTool = useDevToolsStore((s) => s.activeTool);
  // Pixels du dernier clic dans le monde Phaser, pas coordonnées écran/caméra.
  // TODO: ajouter une section Camera quand le contexte caméra sera exposé.
  const screenPoint = useDevToolsStore((s) => s.lastClickedScreenPoint);
  const worldPoint = useDevToolsStore((s) => s.lastClickedWorldPoint);
  const tilePoint = useDevToolsStore((s) => s.lastClickedTilePoint);
  const chunkPoint = useDevToolsStore((s) => s.lastClickedChunkPoint);
  const cursorScreenPoint = useDevToolsStore((s) => s.currentCursorScreenPoint);
  const cursorWorldPoint = useDevToolsStore((s) => s.currentCursorWorldPoint);
  const cursorTilePoint = useDevToolsStore((s) => s.currentCursorTilePoint);
  const cursorChunkPoint = useDevToolsStore((s) => s.currentCursorChunkPoint);
  const cursorWalkable = useDevToolsStore((s) => s.currentCursorWalkable);
  const terrainMapInfo = useDevToolsStore((s) => s.terrainMapInfo);
  const walkabilityOverlayEnabled = useDevToolsStore((s) => s.walkabilityOverlayEnabled);
  const tileCoordinatesOverlayEnabled = useDevToolsStore((s) => s.tileCoordinatesOverlayEnabled);
  const toggleWalkabilityOverlayEnabled = useDevToolsStore((s) => s.toggleWalkabilityOverlayEnabled);
  const toggleTileCoordinatesOverlayEnabled = useDevToolsStore((s) => s.toggleTileCoordinatesOverlayEnabled);

  return (
    <section className="devtools-world__inspector" aria-label="Coordinate inspector">
      <h3 className="devtools-world__title">Coordinates</h3>
      <div className="devtools-world__coordinate-list">
        <CoordinateRow label="Tool" values={[["active", activeTool]]} />
        <CoordinateRow
          label="Map"
          values={[
            ["loaded", terrainMapInfo.loaded ? "yes" : "no"],
            ["key", terrainMapInfo.key],
            ["layer", terrainMapInfo.layerName],
          ]}
        />
        <CoordinateRow
          label="Map Size"
          values={[
            ["w", terrainMapInfo.width],
            ["h", terrainMapInfo.height],
            ["tileW", terrainMapInfo.tileWidth],
            ["tileH", terrainMapInfo.tileHeight],
          ]}
        />
        <CoordinateRow
          label="Walk Grid"
          values={[
            ["w", terrainMapInfo.walkabilityGridWidth],
            ["h", terrainMapInfo.walkabilityGridHeight],
          ]}
        />
        <div className="devtools-world__overlay-toggles">
          <label className="devtools-world__overlay-toggle">
            <input
              className="devtools-world__overlay-checkbox"
              type="checkbox"
              checked={walkabilityOverlayEnabled}
              onChange={toggleWalkabilityOverlayEnabled}
            />
            <span>Walkability Overlay</span>
          </label>
          <label className="devtools-world__overlay-toggle">
            <input
              className="devtools-world__overlay-checkbox"
              type="checkbox"
              checked={tileCoordinatesOverlayEnabled}
              onChange={toggleTileCoordinatesOverlayEnabled}
            />
            <span>Tile Coordinates</span>
          </label>
        </div>
        <CoordinateRow label="Screen" values={[["x", cursorScreenPoint?.x], ["y", cursorScreenPoint?.y]]} />
        <CoordinateRow
          label="World"
          values={[
            ["map", cursorWorldPoint?.mapId],
            ["x", cursorWorldPoint?.worldX],
            ["y", cursorWorldPoint?.worldY],
          ]}
        />
        <CoordinateRow
          label="Tile"
          values={[
            ["map", cursorTilePoint?.mapId],
            ["x", cursorTilePoint?.tileX],
            ["y", cursorTilePoint?.tileY],
          ]}
        />
        <CoordinateRow
          label="Chunk"
          values={[
            ["map", cursorChunkPoint?.mapId],
            ["x", cursorChunkPoint?.chunkX],
            ["y", cursorChunkPoint?.chunkY],
          ]}
        />
        <CoordinateRow
          label="Walkable"
          values={[["value", cursorWalkable === null ? "-" : cursorWalkable ? "true" : "false"]]}
        />
        <CoordinateRow label="Click Screen" values={[["x", screenPoint?.x], ["y", screenPoint?.y]]} />
        <CoordinateRow
          label="Click WU"
          values={[
            ["map", worldPoint?.mapId],
            ["x", worldPoint?.worldX],
            ["y", worldPoint?.worldY],
          ]}
        />
        <CoordinateRow
          label="Click Tile"
          values={[
            ["map", tilePoint?.mapId],
            ["x", tilePoint?.tileX],
            ["y", tilePoint?.tileY],
          ]}
        />
        <CoordinateRow
          label="Click Chunk"
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
