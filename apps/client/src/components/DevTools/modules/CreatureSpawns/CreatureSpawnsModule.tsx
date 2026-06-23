import { useDevToolsStore } from "../../../../store/devtools.store";
import { WorldObjectListModule } from "../../WorldObjectListModule";

export default function CreatureSpawnsModule() {
  const refreshKey        = useDevToolsStore((s) => s.creatureSpawnsRefreshKey);
  const overlayEnabled    = useDevToolsStore((s) => s.creatureSpawnOverlayEnabled);
  const selectedId        = useDevToolsStore((s) => s.selectedWorldObject?.id ?? null);
  const onSelect          = useDevToolsStore((s) => s.setSelectedWorldObject);
  const onRefresh         = useDevToolsStore((s) => s.incrementCreatureSpawnsRefreshKey);
  const onToggleOverlay   = useDevToolsStore((s) => s.toggleCreatureSpawnOverlayEnabled);
  const onClearSelection  = useDevToolsStore((s) => s.clearSelectedWorldObject);

  return (
    <WorldObjectListModule
      title="Creature Spawns"
      fetchUrl="/admin/creature-spawns/world-objects"
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
