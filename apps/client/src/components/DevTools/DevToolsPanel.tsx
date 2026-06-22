import AdminPanel from "../AdminPanel/AdminPanel";
import { WorldModule } from "./modules/World";
import { ResourcesModule } from "./modules/Resources";

export default function DevToolsPanel() {
  return (
    <>
      <WorldModule />
      <ResourcesModule />
      <AdminPanel />
    </>
  );
}
