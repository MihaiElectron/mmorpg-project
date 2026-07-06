/**
 * useDraggableResizable
 * ----------------------------------------------------------------------------
 * Hook local : gère la position (drag) et la taille (resize 8 poignées) d'un
 * panneau flottant. Bornage à la fenêtre. Aucune dépendance externe.
 *
 * La géométrie (x/y/width/height) est renvoyée pour être appliquée en style
 * dynamique — l'apparence reste dans le SCSS.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export const MIN_WIDTH = 240;
export const MIN_HEIGHT = 120;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

export function useDraggableResizable(getInitial) {
  const [rect, setRect] = useState(getInitial);
  // Interaction courante : { mode: "drag" | "resize", dir, startX, startY, startRect }
  const interaction = useRef(null);

  const onMouseMove = useCallback((event) => {
    const s = interaction.current;
    if (!s) return;
    const dx = event.clientX - s.startX;
    const dy = event.clientY - s.startY;

    let { x, y, width, height } = s.startRect;

    if (s.mode === "drag") {
      x += dx;
      y += dy;
    } else {
      const d = s.dir;
      if (d.includes("e")) width = Math.max(MIN_WIDTH, width + dx);
      if (d.includes("s")) height = Math.max(MIN_HEIGHT, height + dy);
      if (d.includes("w")) {
        const newW = Math.max(MIN_WIDTH, width - dx);
        x += width - newW;
        width = newW;
      }
      if (d.includes("n")) {
        const newH = Math.max(MIN_HEIGHT, height - dy);
        y += height - newH;
        height = newH;
      }
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    width = Math.min(width, vw);
    height = Math.min(height, vh);
    x = clamp(x, 0, vw - width);
    y = clamp(y, 0, vh - height);

    setRect({ x, y, width, height });
  }, []);

  const stop = useCallback(() => {
    interaction.current = null;
    window.removeEventListener("mousemove", onMouseMove);
  }, [onMouseMove]);

  const begin = useCallback(
    (event, mode, dir) => {
      event.preventDefault();
      event.stopPropagation();
      interaction.current = {
        mode,
        dir,
        startX: event.clientX,
        startY: event.clientY,
        startRect: { ...rect },
      };
      window.addEventListener("mousemove", onMouseMove);
      // `once` : le listener mouseup se retire tout seul après l'interaction.
      window.addEventListener("mouseup", stop, { once: true });
    },
    [rect, onMouseMove, stop],
  );

  const startDrag = useCallback(
    (event) => {
      // Ne pas démarrer un drag depuis un contrôle interactif (onglets, boutons).
      if (event.target.closest("button")) return;
      begin(event, "drag", null);
    },
    [begin],
  );

  const startResize = useCallback((event, dir) => begin(event, "resize", dir), [begin]);

  // Sécurité : retirer les listeners si le composant est démonté en pleine interaction.
  useEffect(
    () => () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stop);
    },
    [onMouseMove, stop],
  );

  return { rect, startDrag, startResize };
}
