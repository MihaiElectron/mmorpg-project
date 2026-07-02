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
import { buildSlotMap, MIN_SLOT_COUNT } from "./inventorySlots";

export default function Inventory() {
  const inventory = useCharacterStore((s) => s.inventory);
  const equipItem = useCharacterStore((s) => s.equipItem);
  const unequipItem = useCharacterStore((s) => s.unequipItem);
  const setDragEquipSource = useCharacterStore((s) => s.setDragEquipSource);
  const clearDragEquipSource = useCharacterStore((s) => s.clearDragEquipSource);

  const [draggedEntry, setDraggedEntry] = useState(null);
  const [draggedSlotIndex, setDraggedSlotIndex] = useState(null);
  const [dragOverSlotIndex, setDragOverSlotIndex] = useState(null);
  const [dragOverInventory, setDragOverInventory] = useState(false);
  const [pendingDrop, setPendingDrop] = useState(null);
  const [dropQty, setDropQty] = useState(1);
  // slotMap[i] = inventory entry id | null — persiste le tri dans la session.
  // Grille dynamique : min MIN_SLOT_COUNT, étendue si l'inventaire dépasse.
  const [slotMap, setSlotMap] = useState(() => new Array(MIN_SLOT_COUNT).fill(null));
  const qtyInputRef = useRef(null);

  const safeInventory = Array.isArray(inventory) ? inventory : [];

  // Resync slotMap quand l'inventaire change (equip/unequip/loot) :
  // conserve les positions existantes et ne perd jamais une entrée projetée.
  useEffect(() => {
    setSlotMap((prev) => buildSlotMap(prev, safeInventory));
  }, [inventory]);

  const displaySlots = slotMap.map((id) =>
    id ? (safeInventory.find((inv) => inv.id === id) ?? null) : null,
  );

  useEffect(() => {
    if (pendingDrop) {
      setTimeout(() => qtyInputRef.current?.select(), 0);
    }
  }, [pendingDrop]);

  // Listeners window pour le drop vers le monde — actifs seulement pendant un drag inventaire
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
      setDraggedSlotIndex(null);
      setDragOverSlotIndex(null);
      clearDragEquipSource();
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

  // ── Drag depuis un slot inventaire ────────────────────────────────────────

  function handleDragStart(event, inv, slotIndex) {
    if (!inv?.item?.id || inv.quantity < 1) {
      event.preventDefault();
      return;
    }
    const payload = JSON.stringify({
      instanceId: inv.instanceId ?? null,
      itemId: inv.item.id,
      itemSlot: inv.item.slot ?? null,
    });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-inventory-item", payload);
    setDraggedEntry(inv);
    setDraggedSlotIndex(slotIndex);
    setDragEquipSource({ type: "inventory", itemSlot: inv.item.slot ?? null, instanceId: inv.instanceId ?? null });
  }

  // ── Drop inventaire → inventaire (réorganisation) ─────────────────────────

  function handleSlotDragOver(event, slotIndex) {
    if (!event.dataTransfer.types.includes("application/x-inventory-item")) return;
    if (draggedSlotIndex === slotIndex) return;
    event.preventDefault();
    event.stopPropagation(); // empêche le handler world-drop window
    event.dataTransfer.dropEffect = "move";
    setDragOverSlotIndex(slotIndex);
  }

  function handleSlotDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDragOverSlotIndex(null);
    }
  }

  function handleSlotDrop(event, toIndex) {
    event.preventDefault();
    event.stopPropagation();
    setDragOverSlotIndex(null);
    const fromIndex = draggedSlotIndex;
    if (fromIndex === null || fromIndex === toIndex) return;
    setSlotMap((prev) => {
      const next = [...prev];
      [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
      return next;
    });
    setDraggedEntry(null);
    setDraggedSlotIndex(null);
    clearDragEquipSource();
  }

  // ── Drop équipement → inventaire (déséquiper par drag) ────────────────────

  function handleInventoryDragOver(event) {
    if (event.dataTransfer.types.includes("application/x-equipment-slot")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverInventory(true);
    }
  }

  function handleInventoryDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDragOverInventory(false);
    }
  }

  async function handleInventoryDrop(event) {
    setDragOverInventory(false);
    if (!event.dataTransfer.types.includes("application/x-equipment-slot")) return;
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData("application/x-equipment-slot");
    if (!raw) return;
    try {
      const { slot } = JSON.parse(raw);
      if (slot) await unequipItem(slot);
    } catch (e) {
      console.error("[Inventory] equipment drop parse error", e);
    }
  }

  // ── Drop vers le monde (modal quantité) ───────────────────────────────────

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
    <div
      className={`inventory-section${dragOverInventory ? " inventory-section--drag-over" : ""}`}
      onDragOver={handleInventoryDragOver}
      onDragLeave={handleInventoryDragLeave}
      onDrop={handleInventoryDrop}
    >
      <div className="inventory-grid">
        {displaySlots.map((inv, slotIndex) => {
          const item = inv?.item;
          const isDragging = draggedSlotIndex === slotIndex;
          const isDropTarget = dragOverSlotIndex === slotIndex && !isDragging;

          return (
            <div
              key={slotIndex}
              className={[
                "inventory-slot",
                item ? "inventory-slot--filled" : "",
                isDragging ? "inventory-slot--dragging" : "",
                isDropTarget ? "inventory-slot--drop-target" : "",
              ].filter(Boolean).join(" ")}
              draggable={Boolean(item)}
              onDragStart={(event) => handleDragStart(event, inv, slotIndex)}
              onDragOver={(event) => handleSlotDragOver(event, slotIndex)}
              onDragLeave={handleSlotDragLeave}
              onDrop={(event) => handleSlotDrop(event, slotIndex)}
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
