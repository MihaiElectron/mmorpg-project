export type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type PanelSize = { width: number; height: number };
export type PanelPosition = { x: number; y: number };

export type ResizeStart = {
  corner: ResizeCorner;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  originWidth: number;
  originHeight: number;
};

export type ResizeBounds = {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
};

export type ResizeAnchors = {
  horizontal: "left" | "right";
  vertical: "top";
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function calculatePanelResize(
  start: ResizeStart,
  pointerX: number,
  pointerY: number,
  bounds: ResizeBounds,
  anchors: ResizeAnchors = { horizontal: "left", vertical: "top" },
): { position: PanelPosition; size: PanelSize } {
  const dx = pointerX - start.startX;
  const dy = pointerY - start.startY;
  const fromLeft = start.corner.includes("left");
  const fromTop = start.corner.includes("top");

  const width = clamp(
    start.originWidth + (fromLeft ? -dx : dx),
    bounds.minWidth,
    bounds.maxWidth,
  );
  const height = clamp(
    start.originHeight + (fromTop ? -dy : dy),
    bounds.minHeight,
    bounds.maxHeight,
  );

  return {
    position: {
      x: anchors.horizontal === "right"
        ? start.originX + (fromLeft ? 0 : width - start.originWidth)
        : start.originX + (fromLeft ? start.originWidth - width : 0),
      y: fromTop ? start.originY + (start.originHeight - height) : start.originY,
    },
    size: { width, height },
  };
}
