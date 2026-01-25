/**
 * Inventory.jsx
 */
import { useCharacterStore } from "../../store/character.store";

export default function Inventory() {
  const inventory = useCharacterStore((s) => s.inventory);
  const equipItem = useCharacterStore((s) => s.equipItem);

  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const inventorySlots = Array.from({ length: 18 }, (_, i) => i);

  console.log("🎒 Rendering inventory, items:", safeInventory.length);

  return (
    <div className="inventory-section">
      <div className="inventory-grid">
        {inventorySlots.map((slotIndex) => {
          const inv = safeInventory[slotIndex]; // { id, quantity, item }
          const item = inv?.item;

          return (
            <div
              key={slotIndex}
              className="inventory-slot"
              onDoubleClick={() => inv && equipItem(inv.id)}
              title={
                item ? `Double-clic pour équiper ${item.name}` : "Slot vide"
              }
            >
              {item?.image ? (
                <img
                  src={item.image}
                  alt={item.name || "item"}
                  className="inventory-item-image"
                />
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
