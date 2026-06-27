/**
 * Inventory.jsx
 */
import { useEffect, useState } from "react";
import { useCharacterStore } from "../../store/character.store";
import { getDevToolsSocket } from "../DevTools/devtoolsBridge";
import {
  buildInventoryWorldDropPayload,
  emitInventoryWorldDrop,
} from "./inventoryWorldDrop";

export default function Inventory() {
  const inventory = useCharacterStore((s) => s.inventory);
  const equipItem = useCharacterStore((s) => s.equipItem);
  const [draggedEntry, setDraggedEntry] = useState(null);

  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const inventorySlots = Array.from({ length: 18 }, (_, i) => i);

  useEffect(() => {
    if (!draggedEntry) return undefined;

    function handleDragOver(event) {
      const payload = buildInventoryWorldDropPayload({ event, inventoryEntry: draggedEntry });
      if (payload) event.preventDefault();
    }

    async function handleDrop(event) {
      const payload = buildInventoryWorldDropPayload({ event, inventoryEntry: draggedEntry });
      if (!payload) return;
      event.preventDefault();

      const result = await emitInventoryWorldDrop(getDevToolsSocket(), payload);
      if (!result?.success) {
        console.warn("[Inventory] drop_inventory_item failed:", result?.message ?? result);
      }
      setDraggedEntry(null);
    }

    function handleDragEnd() {
      setDraggedEntry(null);
    }

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragend", handleDragEnd);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragend", handleDragEnd);
    };
  }, [draggedEntry]);

  function handleDragStart(event, inv) {
    if (!inv?.item?.id || inv.quantity < 1) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-inventory-item", inv.item.id);
    setDraggedEntry(inv);
  }

  return (
    <div className="inventory-section">
      <div className="inventory-grid">
        {inventorySlots.map((slotIndex) => {
          const inv = safeInventory[slotIndex]; // { id, quantity, item }
          const item = inv?.item;

          return (
            <div
              key={slotIndex}
              className={`inventory-slot${item ? " inventory-slot--filled" : ""}${draggedEntry?.id === inv?.id ? " inventory-slot--dragging" : ""}`}
              draggable={Boolean(item)}
              onDragStart={(event) => handleDragStart(event, inv)}
              onDoubleClick={() => inv && equipItem(inv.id)}
              title={
                item ? `Double-clic pour équiper ${item.name} · Glisser sur le monde pour déposer 1 unité` : "Slot vide"
              }
            >
              {item ? (
                item.image ? (
                  <img
                    src={item.image}
                    alt={item.name || "item"}
                    className="inventory-item-image"
                  />
                ) : (
                  <span className="inventory-item-name">{item.name || "?"}</span>
                )
              ) : (
                <span className="empty-slot">Vide</span>
              )}

              {item && inv?.quantity > 1 && (
                <span className="inventory-quantity">{inv.quantity}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
