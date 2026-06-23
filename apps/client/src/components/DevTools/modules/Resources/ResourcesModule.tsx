import { useDevToolsStore } from "../../../../store/devtools.store";
import { WorldObjectListModule } from "../../WorldObjectListModule";
import { patchClientWorldObject } from "./resourceWorldObjectClientAdapter";
import { ResourceTemplateControls } from "./ResourceTemplateControls";

export default function ResourcesModule() {
  const refreshKey       = useDevToolsStore((s) => s.resourcesRefreshKey);
  const selectedId       = useDevToolsStore((s) => s.selectedWorldObject?.id ?? null);
  const onSelect         = useDevToolsStore((s) => s.setSelectedWorldObject);
  const onRefresh        = useDevToolsStore((s) => s.incrementResourcesRefreshKey);
  const onClearSelection = useDevToolsStore((s) => s.clearSelectedWorldObject);

  return (
    <>
      <WorldObjectListModule
        title="Resources (WOM)"
        fetchUrl="/admin/resources/world-objects"
        socketEvent="resource_update"
        patchFn={patchClientWorldObject}
        refreshKey={refreshKey}
        selectedId={selectedId}
        onSelect={onSelect}
        onRefresh={onRefresh}
        onClearSelection={onClearSelection}
      />
      <ResourceTemplateControls onRefresh={onRefresh} />
    </>
  );
}
