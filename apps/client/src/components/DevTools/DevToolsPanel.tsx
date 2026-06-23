import AdminPanel from "../AdminPanel/AdminPanel";
import { WorldModule } from "./modules/World";
import { ResourcesModule } from "./modules/Resources";
import WorldObjectInspector from "./WorldObjectInspector";

export default function DevToolsPanel() {
  return (
    <>
      <WorldModule />
      <ResourcesModule />
      <WorldObjectInspector />
      <AdminPanel />
    </>
  );
}
