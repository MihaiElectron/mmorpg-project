/**
 * InventoryGridView — présentation PURE (props uniquement), read-only.
 * ----------------------------------------------------------------------------
 * Réutilise les classes SCSS `inventory-*` ET la logique d'ordre du panneau
 * joueur (`buildSlotMap` / `MIN_SLOT_COUNT`) pour une parité d'affichage exacte.
 * Aucun store, aucun drag/drop, aucun world-drop. Le miroir admin n'a pas de
 * tri de session : on passe un slotMap précédent vide → ordre déterministe
 * identique au panneau joueur avant tout drag.
 */
import { buildSlotMap, MIN_SLOT_COUNT } from "../Inventory/inventorySlots";

export interface InventoryGridEntry {
  id: string;
  quantity: number;
  slotIndex?: number | null;
  item: { id: string; name: string; image?: string | null };
}

export interface InventoryGridViewProps {
  entries: InventoryGridEntry[];
  minSlots?: number;
}

export default function InventoryGridView({ entries, minSlots = MIN_SLOT_COUNT }: InventoryGridViewProps) {
  // Même logique que le panneau joueur : slotMap (prev vide) → ids par slot.
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const slotMap = buildSlotMap([], entries, minSlots);
  const slots: (InventoryGridEntry | null)[] = slotMap.map((id) =>
    id != null ? entryById.get(id) ?? null : null,
  );

  return (
    <div className="inventory-section">
      <div className="inventory-grid">
        {slots.map((inv, index) => {
          const item = inv?.item;
          return (
            <div
              key={inv?.id ?? `empty-${index}`}
              className={`inventory-slot${item ? " inventory-slot--filled" : ""}`}
              title={item ? item.name : "Slot vide"}
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
