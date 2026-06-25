import { useState } from "react";
import { getAllOverlayDefinitions } from "../../studio/sdk/capabilities";
import { useDevToolsStore } from "../../store/devtools.store";
import { getOverlayBinding, type OverlayBindingsMap } from "./overlayRegistry";
import "./OverlayControls.scss";

function useOverlayBindingsMap(): OverlayBindingsMap {
  const resourceOverlayEnabled = useDevToolsStore((s) => s.resourceOverlayEnabled);
  const toggleResourceOverlayEnabled = useDevToolsStore((s) => s.toggleResourceOverlayEnabled);
  const creatureOverlayEnabled = useDevToolsStore((s) => s.creatureOverlayEnabled);
  const toggleCreatureOverlayEnabled = useDevToolsStore((s) => s.toggleCreatureOverlayEnabled);
  const creatureSpawnOverlayEnabled = useDevToolsStore((s) => s.creatureSpawnOverlayEnabled);
  const toggleCreatureSpawnOverlayEnabled = useDevToolsStore(
    (s) => s.toggleCreatureSpawnOverlayEnabled,
  );
  const stationRadiusOverlayEnabled = useDevToolsStore((s) => s.stationRadiusOverlayEnabled);
  const toggleStationRadiusOverlayEnabled = useDevToolsStore(
    (s) => s.toggleStationRadiusOverlayEnabled,
  );
  const walkabilityOverlayEnabled = useDevToolsStore((s) => s.walkabilityOverlayEnabled);
  const toggleWalkabilityOverlayEnabled = useDevToolsStore(
    (s) => s.toggleWalkabilityOverlayEnabled,
  );
  const tileCoordinatesOverlayEnabled = useDevToolsStore((s) => s.tileCoordinatesOverlayEnabled);
  const toggleTileCoordinatesOverlayEnabled = useDevToolsStore(
    (s) => s.toggleTileCoordinatesOverlayEnabled,
  );

  return {
    resourceOverlayEnabled,
    toggleResourceOverlayEnabled,
    creatureOverlayEnabled,
    toggleCreatureOverlayEnabled,
    creatureSpawnOverlayEnabled,
    toggleCreatureSpawnOverlayEnabled,
    stationRadiusOverlayEnabled,
    toggleStationRadiusOverlayEnabled,
    walkabilityOverlayEnabled,
    toggleWalkabilityOverlayEnabled,
    tileCoordinatesOverlayEnabled,
    toggleTileCoordinatesOverlayEnabled,
  };
}

export default function OverlayControls() {
  const [isOpen, setIsOpen] = useState(false);
  const map = useOverlayBindingsMap();
  const defs = getAllOverlayDefinitions();

  return (
    <section className="oc">
      <h3 className="oc__title" onClick={() => setIsOpen((o) => !o)}>
        <span className="oc__chevron">{isOpen ? "▼" : "▶"}</span>
        Overlays
      </h3>
      {isOpen && (
        <ul className="oc__list">
          {defs.map((def) => {
            const binding = getOverlayBinding(def.id, map);
            const enabled = binding?.enabled ?? false;

            return (
              <li key={def.id} className="oc__item">
                <span className="oc__label">{def.label}</span>
                <span className="oc__category">{def.category}</span>
                <button
                  className={`oc__toggle${enabled ? " oc__toggle--on" : ""}`}
                  disabled={!binding}
                  onClick={() => binding?.toggle()}
                  aria-pressed={enabled}
                  aria-label={`Toggle overlay ${def.label}`}
                >
                  {enabled ? "ON" : "OFF"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
