import { useDevToolsStore } from "../../../../store/devtools.store";
import { WorldObjectListModule } from "../../WorldObjectListModule";
import { patchCreatureWorldObject } from "./creatureWorldObjectClientAdapter";

export default function CreaturesModule() {
  const refreshKey       = useDevToolsStore((s) => s.creaturesRefreshKey);
  const selectedId       = useDevToolsStore((s) => s.selectedWorldObject?.id ?? null);
  const onSelect         = useDevToolsStore((s) => s.setSelectedWorldObject);
  const onRefresh        = useDevToolsStore((s) => s.incrementCreaturesRefreshKey);
  const onClearSelection = useDevToolsStore((s) => s.clearSelectedWorldObject);

  return (
    <WorldObjectListModule
      title="Creatures (WOM)"
      fetchUrl="/admin/creatures/world-objects"
      socketEvent="creature_update"
      patchFn={patchCreatureWorldObject}
      refreshKey={refreshKey}
      selectedId={selectedId}
      onSelect={onSelect}
      onRefresh={onRefresh}
      onClearSelection={onClearSelection}
    />
  );
}
