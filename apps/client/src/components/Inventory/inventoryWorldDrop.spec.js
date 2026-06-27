import { describe, expect, it, vi } from "vitest";
import {
  buildInventoryWorldDropPayload,
  emitInventoryWorldDrop,
  getWorldDropPosition,
  isBlockedDropTarget,
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
  it("calcule une position WU depuis les coordonnées client du drop", () => {
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

  it("construit le payload minimal itemId/quantity/worldX/worldY", () => {
    const payload = buildInventoryWorldDropPayload({
      event: {
        clientX: 42,
        clientY: 52,
        target: { closest: () => null },
      },
      inventoryEntry: {
        quantity: 3,
        item: { id: "item-1" },
      },
      game: makeGame(),
    });

    expect(payload).toEqual({
      itemId: "item-1",
      quantity: 1,
      worldX: 768,
      worldY: 256,
    });
  });

  it("émet drop_inventory_item avec ack serveur", async () => {
    const socket = {
      connected: true,
      emit: vi.fn((_event, _payload, ack) => ack({ success: true })),
    };

    const result = await emitInventoryWorldDrop(socket, { itemId: "item-1", quantity: 1, worldX: 1, worldY: 2 });

    expect(socket.emit).toHaveBeenCalledWith(
      "drop_inventory_item",
      { itemId: "item-1", quantity: 1, worldX: 1, worldY: 2 },
      expect.any(Function),
    );
    expect(result).toEqual({ success: true });
  });
});
