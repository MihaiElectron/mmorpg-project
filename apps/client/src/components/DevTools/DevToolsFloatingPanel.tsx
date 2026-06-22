import { useEffect, useRef } from "react";
import { useDevToolsStore } from "../../store/devtools.store";
import DevToolsShell from "./DevToolsShell";
import "./DevToolsHud.scss";

function decodeJwtRole(token: string): string | null {
  try {
    return JSON.parse(atob(token.split(".")[1]))?.role ?? null;
  } catch {
    return null;
  }
}

function updatePanelPositionRule(x: number, y: number) {
  if (typeof document === "undefined") return;

  const styleId = "devtools-floating-panel-position";
  let styleNode = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!styleNode) {
    styleNode = document.createElement("style");
    styleNode.id = styleId;
    document.head.appendChild(styleNode);
  }

  const sheet = styleNode.sheet;
  if (!sheet) return;

  while (sheet.cssRules.length > 0) {
    sheet.deleteRule(0);
  }

  sheet.insertRule(
    `.devtools-floating-panel { --devtools-panel-x: ${Math.round(x)}px; --devtools-panel-y: ${Math.round(y)}px; }`,
    0,
  );
}

export default function DevToolsFloatingPanel() {
  const token = localStorage.getItem("token") ?? "";
  const isAdmin = decodeJwtRole(token) === "admin";
  const isOpen = useDevToolsStore((s) => s.isDevToolsOpen);
  const panelPosition = useDevToolsStore((s) => s.panelPosition);
  const setDevToolsOpen = useDevToolsStore((s) => s.setDevToolsOpen);
  const setPanelPosition = useDevToolsStore((s) => s.setPanelPosition);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  useEffect(() => {
    updatePanelPositionRule(panelPosition.x, panelPosition.y);
  }, [panelPosition.x, panelPosition.y]);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag.active) return;
      setPanelPosition({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      });
    }

    function onMouseUp() {
      dragRef.current.active = false;
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [setPanelPosition]);

  if (!isAdmin || !isOpen) return null;

  function startDrag(event: React.MouseEvent<HTMLElement>) {
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: panelPosition.x,
      originY: panelPosition.y,
    };
  }

  return (
    <section className="devtools-floating-panel" aria-label="DevTools panel">
      <header className="devtools-floating-panel__header" onMouseDown={startDrag}>
        <span className="devtools-floating-panel__title">DevTools</span>
        <button
          className="devtools-floating-panel__close"
          type="button"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => setDevToolsOpen(false)}
          aria-label="Fermer DevTools"
        >
          ×
        </button>
      </header>
      <div className="devtools-floating-panel__body">
        <DevToolsShell />
      </div>
    </section>
  );
}
