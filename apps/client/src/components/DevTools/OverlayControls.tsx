import { getAllOverlayDefinitions } from "../../studio/sdk/capabilities";
import { useDevToolsStore } from "../../store/devtools.store";
import { getOverlayBinding, type OverlayBindingsMap } from "./overlayRegistry";
import "./OverlayControls.scss";

function useOverlayBindingsMap(): OverlayBindingsMap {
  const resourceOverlayEnabled = useDevToolsStore((s) => s.resourceOverlayEnabled);
  const toggleResourceOverlayEnabled = useDevToolsStore((s) => s.toggleResourceOverlayEnabled);
  const animalOverlayEnabled = useDevToolsStore((s) => s.animalOverlayEnabled);
  const toggleAnimalOverlayEnabled = useDevToolsStore((s) => s.toggleAnimalOverlayEnabled);
  const creatureSpawnOverlayEnabled = useDevToolsStore((s) => s.creatureSpawnOverlayEnabled);
  const toggleCreatureSpawnOverlayEnabled = useDevToolsStore(
    (s) => s.toggleCreatureSpawnOverlayEnabled,
  );

  return {
    resourceOverlayEnabled,
    toggleResourceOverlayEnabled,
    animalOverlayEnabled,
    toggleAnimalOverlayEnabled,
    creatureSpawnOverlayEnabled,
    toggleCreatureSpawnOverlayEnabled,
  };
}

export default function OverlayControls() {
  const map = useOverlayBindingsMap();
  const defs = getAllOverlayDefinitions();

  return (
    <section className="oc">
      <h3 className="oc__title">Overlays</h3>
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
    </section>
  );
}
