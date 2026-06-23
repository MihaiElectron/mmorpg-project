import { useDevToolsStore } from "../../../../store/devtools.store";
import { WorldObjectListModule } from "../../WorldObjectListModule";
import { patchAnimalWorldObject } from "./animalWorldObjectClientAdapter";

export default function AnimalsModule() {
  const refreshKey      = useDevToolsStore((s) => s.animalsRefreshKey);
  const overlayEnabled  = useDevToolsStore((s) => s.animalOverlayEnabled);
  const selectedId      = useDevToolsStore((s) => s.selectedWorldObject?.id ?? null);
  const onSelect        = useDevToolsStore((s) => s.setSelectedWorldObject);
  const onRefresh       = useDevToolsStore((s) => s.incrementAnimalsRefreshKey);
  const onToggleOverlay = useDevToolsStore((s) => s.toggleAnimalOverlayEnabled);
  const onClearSelection = useDevToolsStore((s) => s.clearSelectedWorldObject);

  return (
    <WorldObjectListModule
      title="Animals (WOM)"
      fetchUrl="/admin/animals/world-objects"
      socketEvent="animal_update"
      patchFn={patchAnimalWorldObject}
      refreshKey={refreshKey}
      overlayEnabled={overlayEnabled}
      selectedId={selectedId}
      onSelect={onSelect}
      onRefresh={onRefresh}
      onToggleOverlay={onToggleOverlay}
      onClearSelection={onClearSelection}
    />
  );
}
