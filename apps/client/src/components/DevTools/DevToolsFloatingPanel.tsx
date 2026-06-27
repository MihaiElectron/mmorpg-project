import { useEffect, useRef } from "react";
import { useDevToolsStore } from "../../store/devtools.store";
import DevToolsShell from "./DevToolsShell";
import {
  calculatePanelResize,
  type ResizeCorner,
  type ResizeStart,
} from "./resizePanel";
import "./DevToolsHud.scss";

function decodeJwtRole(token: string): string | null {
  try {
    return JSON.parse(atob(token.split(".")[1]))?.role ?? null;
  } catch {
    return null;
  }
}

const RESIZE_CORNERS: ResizeCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

function updatePanelRule(
  x: number,
  y: number,
  size: { width: number; height: number } | null,
) {
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

  const sizeVars = size
    ? ` --devtools-panel-width: ${Math.round(size.width)}px; --devtools-panel-height: ${Math.round(size.height)}px;`
    : "";

  sheet.insertRule(
    `.devtools-floating-panel { --devtools-panel-x: ${Math.round(x)}px; --devtools-panel-y: ${Math.round(y)}px;${sizeVars} }`,
    0,
  );
}

export default function DevToolsFloatingPanel() {
  const token = localStorage.getItem("token") ?? "";
  const isAdmin = decodeJwtRole(token) === "admin";
  const isOpen = useDevToolsStore((s) => s.isDevToolsOpen);
  const panelPosition = useDevToolsStore((s) => s.panelPosition);
  const panelSize = useDevToolsStore((s) => s.panelSize);
  const setDevToolsOpen = useDevToolsStore((s) => s.setDevToolsOpen);
  const setPanelPosition = useDevToolsStore((s) => s.setPanelPosition);
  const setPanelSize = useDevToolsStore((s) => s.setPanelSize);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const resizeRef = useRef<ResizeStart | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    updatePanelRule(panelPosition.x, panelPosition.y, panelSize);
  }, [panelPosition.x, panelPosition.y, panelSize]);

  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const resize = resizeRef.current;
      if (resize) {
        const next = calculatePanelResize(resize, event.clientX, event.clientY, {
          minWidth: 280,
          minHeight: 160,
          maxWidth: Math.max(280, window.innerWidth - 32),
          maxHeight: Math.max(160, window.innerHeight - 132),
        }, { horizontal: "right", vertical: "top" });
        setPanelPosition(next.position);
        setPanelSize(next.size);
        return;
      }

      const drag = dragRef.current;
      if (!drag.active) return;
      setPanelPosition({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      });
    }

    function onMouseUp() {
      dragRef.current.active = false;
      resizeRef.current = null;
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [setPanelPosition, setPanelSize]);

  if (!isAdmin || !isOpen) return null;

  function startDrag(event: React.MouseEvent<HTMLElement>) {
    if (resizeRef.current) return;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: panelPosition.x,
      originY: panelPosition.y,
    };
  }

  function startResize(corner: ResizeCorner, event: React.MouseEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current.active = false;
    resizeRef.current = {
      corner,
      startX: event.clientX,
      startY: event.clientY,
      originX: panelPosition.x,
      originY: panelPosition.y,
      originWidth: rect.width,
      originHeight: rect.height,
    };
  }

  return (
    <section ref={panelRef} className="devtools-floating-panel" aria-label="DevTools panel">
      {RESIZE_CORNERS.map((corner) => (
        <span
          key={corner}
          className={`devtools-floating-panel__resize devtools-floating-panel__resize--${corner}`}
          onMouseDown={(event) => startResize(corner, event)}
          aria-hidden="true"
        />
      ))}
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
