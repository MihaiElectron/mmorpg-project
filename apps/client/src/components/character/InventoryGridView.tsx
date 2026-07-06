/**
 * InventoryGridView — grille d'inventaire réutilisable.
 * ----------------------------------------------------------------------------
 * Réutilise les classes SCSS `inventory-*` ET la logique d'ordre du panneau
 * joueur (`buildSlotMap` / `MIN_SLOT_COUNT`) pour une parité d'affichage exacte.
 *
 * Deux modes :
 * - read-only (défaut) : aucun drag/drop, aucun store.
 * - `editable` (miroir admin) : drag/drop UI uniquement. Aucune logique métier
 *   ici — les intentions (`onReorder`, `onEquipmentDrop`) sont remontées au
 *   parent qui émet vers le serveur (autorité unique). L'ordre affiché reste
 *   piloté par le serveur via `slotIndex`.
 */
import { useState } from "react";
import { buildSlotMap, MIN_SLOT_COUNT } from "../Inventory/inventorySlots";

// Types DnD dédiés à l'admin (évite toute interférence avec le panneau joueur).
export const ADMIN_INV_DND = "application/x-admin-inventory-item";
export const ADMIN_EQ_DND = "application/x-admin-equipment-slot";

export interface InventoryGridEntry {
  id: string;
  instanceId?: string | null;
  quantity: number;
  slotIndex?: number | null;
  item: {
    id: string;
    name: string;
    image?: string | null;
    objectMode?: string;
    slot?: string | null;
  };
}

export interface AdminReorderEntry {
  kind: "stack" | "instance";
  id: string;
  slotIndex: number;
}

export interface InventoryGridViewProps {
  entries: InventoryGridEntry[];
  minSlots?: number;
  /** Active le drag/drop admin. */
  editable?: boolean;
  /** Réordonnancement inventaire → inventaire (payload complet des positions). */
  onReorder?: (entries: AdminReorderEntry[]) => void;
  /** Drop d'un slot d'équipement sur une case → déséquiper vers cette case. */
  onEquipmentDrop?: (targetSlotIndex: number, slot: string) => void;
  /** Double-clic sur un item d'inventaire (confort : équiper si possible). */
  onItemDoubleClick?: (entry: InventoryGridEntry) => void;
}

export default function InventoryGridView({
  entries,
  minSlots = MIN_SLOT_COUNT,
  editable = false,
  onReorder,
  onEquipmentDrop,
  onItemDoubleClick,
}: InventoryGridViewProps) {
  const [fromIndex, setFromIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Même logique que le panneau joueur : slotMap (prev vide) → ids par slot.
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const slotMap = buildSlotMap([], entries, minSlots);
  const slots: (InventoryGridEntry | null)[] = slotMap.map((id) =>
    id != null ? entryById.get(id) ?? null : null,
  );

  function payloadFromMap(map: (string | null)[]): AdminReorderEntry[] {
    const out: AdminReorderEntry[] = [];
    map.forEach((id, index) => {
      if (id == null) return;
      const e = entryById.get(id);
      if (!e) return;
      out.push({
        kind: e.instanceId ? "instance" : "stack",
        id: e.instanceId ?? e.id,
        slotIndex: index,
      });
    });
    return out;
  }

  function handleDragStart(event: React.DragEvent, index: number, inv: InventoryGridEntry) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      ADMIN_INV_DND,
      JSON.stringify({ entryId: inv.id, instanceId: inv.instanceId ?? null, itemSlot: inv.item.slot ?? null, objectMode: inv.item.objectMode ?? null }),
    );
    setFromIndex(index);
  }

  function handleDragOver(event: React.DragEvent, index: number) {
    const types = event.dataTransfer.types;
    const isInv = types.includes(ADMIN_INV_DND);
    const isEq = types.includes(ADMIN_EQ_DND);
    if (!isInv && !isEq) return;
    if (isInv && fromIndex === index) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  }

  function handleDragLeave(event: React.DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOverIndex(null);
  }

  function resetDrag() {
    setFromIndex(null);
    setOverIndex(null);
  }

  function handleDrop(event: React.DragEvent, toIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    setOverIndex(null);

    // Déséquipement : slot d'équipement déposé sur une case précise.
    if (event.dataTransfer.types.includes(ADMIN_EQ_DND)) {
      const raw = event.dataTransfer.getData(ADMIN_EQ_DND);
      resetDrag();
      if (!raw) return;
      try {
        const { slot } = JSON.parse(raw);
        if (slot && onEquipmentDrop) onEquipmentDrop(toIndex, slot);
      } catch {
        /* payload invalide : ignoré */
      }
      return;
    }

    // Réordonnancement inventaire → inventaire.
    const from = fromIndex;
    if (from == null || from === toIndex) {
      resetDrag();
      return;
    }
    const next = [...slotMap];
    [next[from], next[toIndex]] = [next[toIndex], next[from]];
    resetDrag();
    if (onReorder) onReorder(payloadFromMap(next));
  }

  return (
    <div className="inventory-section">
      <div className="inventory-grid">
        {slots.map((inv, index) => {
          const item = inv?.item;
          const isDragging = editable && fromIndex === index;
          const isDropTarget = editable && overIndex === index && !isDragging;
          return (
            <div
              key={inv?.id ?? `empty-${index}`}
              className={[
                "inventory-slot",
                item ? "inventory-slot--filled" : "",
                isDragging ? "inventory-slot--dragging" : "",
                isDropTarget ? "inventory-slot--drop-target" : "",
              ].filter(Boolean).join(" ")}
              title={item ? item.name : "Slot vide"}
              draggable={editable && Boolean(item)}
              onDragStart={editable && inv ? (e) => handleDragStart(e, index, inv) : undefined}
              onDragEnd={editable ? resetDrag : undefined}
              onDragOver={editable ? (e) => handleDragOver(e, index) : undefined}
              onDragLeave={editable ? handleDragLeave : undefined}
              onDrop={editable ? (e) => handleDrop(e, index) : undefined}
              onDoubleClick={editable && inv && onItemDoubleClick ? () => onItemDoubleClick(inv) : undefined}
            >
              {item ? (
                item.image ? (
                  <img src={item.image} alt={item.name || "item"} className="inventory-item-image" />
                ) : (
                  <span className="inventory-item-name">{item.name || "?"}</span>
                )
              ) : (
                <span className="empty-slot">Vide</span>
              )}

              {item && (inv?.quantity ?? 0) > 1 && (
                <span className="inventory-quantity">{inv!.quantity}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
