import { useDevToolsStore } from "../../store/devtools.store";
import "./DevToolsHud.scss";

function decodeJwtRole(token: string): string | null {
  try {
    return JSON.parse(atob(token.split(".")[1]))?.role ?? null;
  } catch {
    return null;
  }
}

export default function DevToolsHudButton() {
  const token = localStorage.getItem("token") ?? "";
  const isAdmin = decodeJwtRole(token) === "admin";
  const isOpen = useDevToolsStore((s) => s.isDevToolsOpen);
  const isEditMode = useDevToolsStore((s) => s.isEditMode);
  const toggleOpen = useDevToolsStore((s) => s.toggleDevToolsOpen);
  const setEditMode = useDevToolsStore((s) => s.setEditMode);

  if (!isAdmin) return null;

  return (
    <div className="devtools-hud" aria-label="DevTools HUD">
      <button
        className={`devtools-hud__button${isOpen ? " is-active" : ""}`}
        type="button"
        onClick={toggleOpen}
      >
        DevTools
      </button>
      <label className="devtools-hud__edit">
        <span>Edit {isEditMode ? "ON" : "OFF"}</span>
        <input
          className="devtools-hud__checkbox"
          type="checkbox"
          checked={isEditMode}
          onChange={(event) => setEditMode(event.target.checked)}
        />
      </label>
    </div>
  );
}
