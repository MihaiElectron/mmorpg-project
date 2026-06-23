import AdminPanelWOM from "../AdminPanel/AdminPanelWOM";
import { WorldModule } from "./modules/World";
import OverlayControls from "./OverlayControls";
import "./DevToolsPanel.scss";

export default function DevToolsPanel() {
  return (
    <>
      <WorldModule />
      <OverlayControls />
      <AdminPanelWOM />
    </>
  );
}
