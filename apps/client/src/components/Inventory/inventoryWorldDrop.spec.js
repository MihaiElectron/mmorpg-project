import { describe, expect, it, vi } from "vitest";
import {
  buildInventoryWorldDropPayload,
  emitInventoryWorldDrop,
  getWorldDropPosition,
  isBlockedDropTarget,
  isValidWorldDrop,
} from "./inventoryWorldDrop";

function makeGame() {
  return {
    canvas: {
      getBoundingClientRect: () => ({
        left: 10,
        top: 20,
        right: 210,
        bottom: 220,
      }),
    },
    scene: {
      getScene: () => ({
        cameras: {
          main: {
            getWorldPoint: (x, y) => ({ x: x + 1000, y }),
          },
        },
      }),
    },
  };
}

describe("inventoryWorldDrop", () => {
  it("calcule une position WU depuis les coordonnees client du drop", () => {
    const position = getWorldDropPosition({
      clientX: 42,
      clientY: 52,
      game: makeGame(),
    });

    expect(position).toEqual({ worldX: 768, worldY: 256 });
  });

  it("refuse un drop hors canvas", () => {
    expect(getWorldDropPosition({
      clientX: 400,
      clientY: 52,
      game: makeGame(),
    })).toBeNull();
  });

  it("bloque les drops sur HUD, inventaire et panels", () => {
    const target = {
      closest: vi.fn((selector) => selector === ".inventory-section" ? {} : null),
    };

    expect(isBlockedDropTarget(target)).toBe(true);
  });

  it("construit un payload avec la quantite maximale de la pile", () => {
    const payload = buildInventoryWorldDropPayload({
      event: {
        clientX: 42,
        clientY: 52,
        target: { closest: () => null },
      },
      inventoryEntry: {
        id: "inv-entry-1",
        quantity: 3,
        item: { id: "item-1" },
      },
      game: makeGame(),
    });

    expect(payload).toEqual({ inventoryEntryId: "inv-entry-1", quantity: 3 });
  });

  it("construit un payload avec une quantite partielle si precisee", () => {
    const payload = buildInventoryWorldDropPayload({
      event: {
        clientX: 42,
        clientY: 52,
        target: { closest: () => null },
      },
      inventoryEntry: {
        id: "inv-entry-1",
        quantity: 5,
        item: { id: "item-1" },
      },
      quantity: 2,
      game: makeGame(),
    });

    expect(payload).toEqual({ inventoryEntryId: "inv-entry-1", quantity: 2 });
  });

  it("retourne null si l’item est hors canvas", () => {
    const payload = buildInventoryWorldDropPayload({
      event: {
        clientX: 999,
        clientY: 52,
        target: { closest: () => null },
      },
      inventoryEntry: { quantity: 1, item: { id: "item-1" } },
      game: makeGame(),
    });

    expect(payload).toBeNull();
  });

  it("isValidWorldDrop retourne true pour un drop valide sur le canvas", () => {
    const valid = isValidWorldDrop({
      event: {
        clientX: 42,
        clientY: 52,
        target: { closest: () => null },
      },
      inventoryEntry: { quantity: 1, item: { id: "item-1" } },
      game: makeGame(),
    });

    expect(valid).toBe(true);
  });

  it("isValidWorldDrop retourne false si cible bloquee", () => {
    const valid = isValidWorldDrop({
      event: {
        clientX: 42,
        clientY: 52,
        target: { closest: (s) => s === ".action-panel" ? {} : null },
      },
      inventoryEntry: { quantity: 1, item: { id: "item-1" } },
      game: makeGame(),
    });

    expect(valid).toBe(false);
  });

  it("emet drop_inventory_item avec ack serveur", async () => {
    const socket = {
      connected: true,
      emit: vi.fn((_event, _payload, ack) => ack({ success: true })),
    };

    const result = await emitInventoryWorldDrop(socket, { inventoryEntryId: "inv-1", quantity: 3 });

    expect(socket.emit).toHaveBeenCalledWith(
      "drop_inventory_item",
      { inventoryEntryId: "inv-1", quantity: 3 },
      expect.any(Function),
    );
    expect(result).toEqual({ success: true });
  });
});
