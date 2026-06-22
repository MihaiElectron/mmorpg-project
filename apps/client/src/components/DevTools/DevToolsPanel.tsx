import AdminPanel from "../AdminPanel/AdminPanel";
import CoordinateInspector from "./CoordinateInspector";

export default function DevToolsPanel() {
  return (
    <>
      <CoordinateInspector />
      <AdminPanel />
    </>
  );
}
