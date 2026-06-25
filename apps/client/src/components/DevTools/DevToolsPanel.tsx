import AdminPanelWOM from "../AdminPanel/AdminPanelWOM";
import { WorldModule } from "./modules/World";
import OverlayControls from "./OverlayControls";
import { RuntimeStatsPanel, RuntimeInspectorPanel } from "./modules/PlayerRuntime";
import "./DevToolsPanel.scss";

export default function DevToolsPanel() {
  return (
    <>
      <WorldModule />
      <RuntimeStatsPanel />
      <RuntimeInspectorPanel />
      <OverlayControls />
      <AdminPanelWOM />
    </>
  );
}
