import AdminPanel from "../AdminPanel/AdminPanel";
import { WorldModule } from "./modules/World";
import { ResourcesModule } from "./modules/Resources";
import WorldObjectInspector from "./WorldObjectInspector";

export default function DevToolsPanel() {
  return (
    <>
      <WorldObjectInspector />
      <WorldModule />
      <ResourcesModule />
      <AdminPanel />
    </>
  );
}
