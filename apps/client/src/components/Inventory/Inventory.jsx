/**
 * Inventory.jsx
 */
import { useEffect, useRef, useState } from "react";
import { useCharacterStore } from "../../store/character.store";
import { getDevToolsSocket } from "../DevTools/devtoolsBridge";
import {
  buildInventoryWorldDropPayload,
  emitInventoryWorldDrop,
  isValidWorldDrop,
} from "./inventoryWorldDrop";

export default function Inventory() {
  const inventory = useCharacterStore((s) => s.inventory);
  const equipItem = useCharacterStore((s) => s.equipItem);
  const [draggedEntry, setDraggedEntry] = useState(null);
  const [pendingDrop, setPendingDrop] = useState(null);
  const [dropQty, setDropQty] = useState(1);
  const qtyInputRef = useRef(null);

  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const inventorySlots = Array.from({ length: 18 }, (_, i) => i);

  useEffect(() => {
    if (pendingDrop) {
      setTimeout(() => qtyInputRef.current?.select(), 0);
    }
  }, [pendingDrop]);

  useEffect(() => {
    if (!draggedEntry) return undefined;

    function handleDragOver(event) {
      const valid = isValidWorldDrop({ event, inventoryEntry: draggedEntry });
      if (valid) event.preventDefault();
    }

    async function handleDrop(event) {
      const payload = buildInventoryWorldDropPayload({ event, inventoryEntry: draggedEntry });
      if (!payload) return;
      event.preventDefault();

      if (draggedEntry.quantity > 1) {
        setDropQty(draggedEntry.quantity);
        setPendingDrop({ inventoryEntry: draggedEntry });
        setDraggedEntry(null);
        return;
      }

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

  async function confirmDrop() {
    if (!pendingDrop) return;
    const qty = Math.max(1, Math.min(dropQty, pendingDrop.inventoryEntry.quantity));
    const payload = {
      inventoryEntryId: pendingDrop.inventoryEntry.id,
      quantity: qty,
    };
    const result = await emitInventoryWorldDrop(getDevToolsSocket(), payload);
    if (!result?.success) {
      console.warn("[Inventory] drop_inventory_item failed:", result?.message ?? result);
    }
    setPendingDrop(null);
  }

  function cancelDrop() {
    setPendingDrop(null);
  }

  function handleQtyKeyDown(e) {
    if (e.key === "Enter") { e.preventDefault(); confirmDrop(); }
    if (e.key === "Escape") cancelDrop();
  }

  return (
    <div className="inventory-section">
      <div className="inventory-grid">
        {inventorySlots.map((slotIndex) => {
          const inv = safeInventory[slotIndex];
          const item = inv?.item;

          return (
            <div
              key={slotIndex}
              className={`inventory-slot${item ? " inventory-slot--filled" : ""}${draggedEntry?.id === inv?.id ? " inventory-slot--dragging" : ""}`}
              draggable={Boolean(item)}
              onDragStart={(event) => handleDragStart(event, inv)}
              onDoubleClick={() => inv && equipItem(inv.id)}
              title={
                item
                  ? `Double-clic pour equiper ${item.name} · Glisser sur le monde pour deposer`
                  : "Slot vide"
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

      {pendingDrop && (
        <div className="inventory-drop-modal">
          <div className="inventory-drop-modal__box">
            <p className="inventory-drop-modal__label">
              {pendingDrop.inventoryEntry.item?.name ?? pendingDrop.inventoryEntry.item?.id}
            </p>
            <p className="inventory-drop-modal__hint">
              Quantite a deposer (1 – {pendingDrop.inventoryEntry.quantity})
            </p>
            <input
              ref={qtyInputRef}
              className="inventory-drop-modal__input"
              type="number"
              min={1}
              max={pendingDrop.inventoryEntry.quantity}
              value={dropQty}
              onChange={(e) => setDropQty(Number(e.target.value))}
              onKeyDown={handleQtyKeyDown}
            />
            <div className="inventory-drop-modal__actions">
              <button className="inventory-drop-modal__btn inventory-drop-modal__btn--confirm" onClick={confirmDrop}>
                Deposer
              </button>
              <button className="inventory-drop-modal__btn inventory-drop-modal__btn--cancel" onClick={cancelDrop}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
