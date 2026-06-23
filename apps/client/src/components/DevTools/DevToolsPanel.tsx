import { useState } from "react";
import AdminPanel from "../AdminPanel/AdminPanel";
import AdminPanelWOM from "../AdminPanel/AdminPanelWOM";
import { WorldModule } from "./modules/World";
import OverlayControls from "./OverlayControls";
import "./DevToolsPanel.scss";

type AdminView = "wom" | "legacy";

export default function DevToolsPanel() {
  const [adminView, setAdminView] = useState<AdminView>("wom");

  return (
    <>
      <WorldModule />
      <OverlayControls />
      <div className="devtools-panel__admin-tabs">
        <button
          className={`devtools-panel__admin-tab${adminView === "wom" ? " is-active" : ""}`}
          onClick={() => setAdminView("wom")}
        >
          Admin (WOM)
        </button>
        <button
          className={`devtools-panel__admin-tab${adminView === "legacy" ? " is-active" : ""}`}
          onClick={() => setAdminView("legacy")}
        >
          Admin (Legacy)
        </button>
      </div>
      {adminView === "wom"    && <AdminPanelWOM />}
      {adminView === "legacy" && <AdminPanel />}
    </>
  );
}
