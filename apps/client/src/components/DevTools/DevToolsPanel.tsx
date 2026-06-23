import AdminPanel from "../AdminPanel/AdminPanel";
import { WorldModule } from "./modules/World";
import { ResourcesModule } from "./modules/Resources";
import { AnimalsModule } from "./modules/Animals";
import WorldObjectInspector from "./WorldObjectInspector";
import ValidationPanel from "./ValidationPanel";

export default function DevToolsPanel() {
  return (
    <>
      <WorldModule />
      <ResourcesModule />
      <AnimalsModule />
      <WorldObjectInspector />
      <ValidationPanel />
      <AdminPanel />
    </>
  );
}
