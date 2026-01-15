/**
 * CharacterLayout.jsx
 * -----------------------------------------------------------------------------
 * Conteneur principal du layout personnage + inventaire
 * - Onglet demi-cercle pour ouvrir/fermer le panneau
 * - Affiche le CharacterLayer (personnage + équipement)
 * - Affiche un inventaire de 18 slots
 *
 * Emplacement :
 * apps/client/src/components/CharacterLayout/CharacterLayout.jsx
 *
 * Dépendances :
 * - useCharacterStore : Zustand pour personnage, équipement et inventaire
 *
 * Fonctionnalités :
 * - Double-clic sur un item de l'inventaire l'équipe dans le slot approprié
 * - Double-clic sur un slot équipé le retourne dans l'inventaire
 * -----------------------------------------------------------------------------
 */

import CharacterLayer from "../CharacterLayer/CharacterLayer";
import { useCharacterStore } from "../../store/character.store";

export default function CharacterLayout() {
  // ---------------------------------------------------------------------------
  // Etat du panneau et actions
  // ---------------------------------------------------------------------------
  const isOpen = useCharacterStore((s) => s.isOpen);
  const toggleOpen = useCharacterStore((s) => s.toggleOpen);

  // ---------------------------------------------------------------------------
  // Inventaire et équipement depuis le store
  // ---------------------------------------------------------------------------
  const inventory = useCharacterStore((s) => s.inventory);
  const equipment = useCharacterStore((s) => s.equipment);
  const equipItem = useCharacterStore((s) => s.equipItem);

  // ---------------------------------------------------------------------------
  // Slots d'inventaire : 18 cases
  // ---------------------------------------------------------------------------
  const inventorySlots = Array.from({ length: 18 }, (_, i) => i);

  // ---------------------------------------------------------------------------
  // Fonction pour équiper un item depuis l'inventaire dans son slot
  // ---------------------------------------------------------------------------
  const handleEquip = async (inv) => {
    if (!inv?.item) return;
    await equipItem(inv.item.id);
  };

  return (
    <div className={`character-layout ${isOpen ? "is-open" : "is-closed"}`}>
      {/* Onglet pour ouvrir/fermer le panneau */}
      <button className="character-layout__tab" onClick={toggleOpen}>
        Perso
      </button>

      {/* ---------------------------------------------------------------------
          Section personnage : CharacterLayer (portrait + slots équipés)
          --------------------------------------------------------------------- */}
      <div className="character-layout__content">
        <CharacterLayer />
      </div>

      {/* ---------------------------------------------------------------------
          Section inventaire : 18 slots dynamiques
          - L'inventory est un tableau d'objets { id, quantity, equipped, item }
          - Double-clic sur un item l'équipe dans le slot approprié
          --------------------------------------------------------------------- */}
      <div className="character-layout__inventory">
        <div className="inventory-grid">
          {inventorySlots.map((slotIndex) => {
            const inv = inventory[slotIndex]; // objet inventory ou undefined
            const item = inv?.item; // l'item réel (null si slot vide)
            return (
              <div
                key={slotIndex}
                className="inventory-slot"
                onDoubleClick={() => handleEquip(inv)}
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
                {/* Affiche la quantity si > 1 */}
                {item && inv?.quantity > 1 && (
                  <span className="inventory-quantity">{inv.quantity}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
