import AdminPanel from "../AdminPanel/AdminPanel";
import { WorldModule } from "./modules/World";

export default function DevToolsPanel() {
  return (
    <>
      <WorldModule />
      <AdminPanel />
    </>
  );
}
