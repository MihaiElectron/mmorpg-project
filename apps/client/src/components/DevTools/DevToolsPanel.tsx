import AdminPanel from "../AdminPanel/AdminPanel";
import { WorldModule } from "./modules/World";
import { ResourcesModule } from "./modules/Resources";
import { AnimalsModule } from "./modules/Animals";
import { CreatureSpawnsModule } from "./modules/CreatureSpawns";
import WorldObjectInspector from "./WorldObjectInspector";
import ValidationPanel from "./ValidationPanel";
import OverlayControls from "./OverlayControls";
import SelectedActionsPanel from "./SelectedActionsPanel";
import CommandPalette from "./CommandPalette";

export default function DevToolsPanel() {
  return (
    <>
      <WorldModule />
      <OverlayControls />
      <ResourcesModule />
      <AnimalsModule />
      <CreatureSpawnsModule />
      <WorldObjectInspector />
      <SelectedActionsPanel />
      <CommandPalette />
      <ValidationPanel />
      <AdminPanel />
    </>
  );
}
