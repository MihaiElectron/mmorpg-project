/**
 * Inventory.jsx 
 */

export default function Inventory({ inventory, onEquip }) {
  const inventorySlots = Array.from({ length: 18 }, (_, i) => i);

  return (
    <div className="inventory-section">
      <div className="inventory-grid">
        {inventorySlots.map((slotIndex) => {
          const inv = inventory[slotIndex];
          const item = inv?.item;

          return (
            <div
              key={slotIndex}
              className="inventory-slot"
              onDoubleClick={() => onEquip(inv)}
              title={item ? `Double-clic pour équiper ${item.name}` : "Slot vide"}
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
