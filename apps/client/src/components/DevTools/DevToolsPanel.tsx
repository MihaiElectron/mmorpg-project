import AdminPanelWOM from "../AdminPanel/AdminPanelWOM";
import { WorldModule } from "./modules/World";
import { ItemsModule } from "./modules/Items";
import { LootPoolModule } from "./modules/LootPools";
import OverlayControls from "./OverlayControls";
import {
  RuntimeStatsPanel,
  RuntimeInspectorPanel,
} from "./modules/PlayerRuntime";
import { worldObjectToInspectorTarget } from "./modules/PlayerRuntime/inspectorTarget";
import { useDevToolsStore } from "../../store/devtools.store";
import LotsInspector from "./LotsInspector";
import "./DevToolsPanel.scss";

export default function DevToolsPanel() {
  const selectedWorldObject = useDevToolsStore((s) => s.selectedWorldObject);
  const target = worldObjectToInspectorTarget(selectedWorldObject);

  return (
    <>
      <WorldModule />
      <RuntimeStatsPanel />
      <RuntimeInspectorPanel target={target} />
      <ItemsModule />
      <LootPoolModule />
      <LotsInspector />
      <OverlayControls />
      <AdminPanelWOM />
    </>
  );
}
