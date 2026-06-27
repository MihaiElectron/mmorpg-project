import { screenToWorldWU } from "../../phaser/utils/worldCoordinates";

const BLOCKED_DROP_SELECTORS = [
  ".inventory-section",
  ".character-layout",
  ".devtools-floating-panel",
  ".devtools-hud",
  ".action-panel",
  ".admin-panel",
  ".coordinates-layer",
];

export function isBlockedDropTarget(target) {
  if (!target || typeof target.closest !== "function") return false;
  return BLOCKED_DROP_SELECTORS.some((selector) => Boolean(target.closest(selector)));
}

export function getWorldDropPosition({ clientX, clientY, game }) {
  const canvas = game?.canvas;
  const scene = game?.scene?.getScene?.("WorldScene");
  const camera = scene?.cameras?.main;
  if (!canvas || !camera || typeof canvas.getBoundingClientRect !== "function") {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return null;
  }

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const worldPoint = camera.getWorldPoint(localX, localY);
  const wu = screenToWorldWU(worldPoint.x, worldPoint.y);
  return {
    worldX: wu.worldX,
    worldY: wu.worldY,
  };
}

export function isValidWorldDrop({ event, inventoryEntry, game = window.game }) {
  if (!inventoryEntry?.item?.id || inventoryEntry.quantity < 1) return false;
  if (isBlockedDropTarget(event.target)) return false;
  return getWorldDropPosition({ clientX: event.clientX, clientY: event.clientY, game }) !== null;
}

export function buildInventoryWorldDropPayload({ event, inventoryEntry, quantity, game = window.game }) {
  if (!inventoryEntry?.item?.id || inventoryEntry.quantity < 1) return null;
  if (isBlockedDropTarget(event.target)) return null;

  const position = getWorldDropPosition({
    clientX: event.clientX,
    clientY: event.clientY,
    game,
  });
  if (!position) return null;

  const qty = quantity != null ? quantity : inventoryEntry.quantity;

  return {
    inventoryEntryId: inventoryEntry.id,
    quantity: qty,
  };
}

export function emitInventoryWorldDrop(socket, payload) {
  return new Promise((resolve) => {
    if (!socket?.connected || !payload) {
      resolve({ success: false, message: "Socket non connecte." });
      return;
    }
    socket.emit("drop_inventory_item", payload, (response) => {
      resolve(response ?? { success: false, message: "Aucune reponse serveur." });
    });
  });
}
