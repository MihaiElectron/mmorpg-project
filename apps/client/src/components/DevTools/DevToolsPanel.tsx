import AdminPanel from "../AdminPanel/AdminPanel";
import { WorldModule } from "./modules/World";
import OverlayControls from "./OverlayControls";

export default function DevToolsPanel() {
  return (
    <>
      <WorldModule />
      <OverlayControls />
      <AdminPanel />
    </>
  );
}
