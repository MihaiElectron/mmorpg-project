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

  // ---------------------------------------------------------------------------
  // Slots d’inventaire : 18 cases
  // ---------------------------------------------------------------------------
  const inventorySlots = Array.from({ length: 18 }, (_, i) => i);

  // ---------------------------------------------------------------------------
  // Fonction pour équiper un item depuis l’inventaire dans son slot
  // ---------------------------------------------------------------------------
  const handleEquip = async (item) => {
    if (!item) return;
    await useCharacterStore.getState().equipItem(item.id);
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
          --------------------------------------------------------------------- */}
      <div className="character-layout__inventory">
        <div className="inventory-grid">
          {inventorySlots.map((slotIndex) => {
            const item = inventory[slotIndex]; // récupère l’item dans le slot ou undefined
            return (
              <div
                key={slotIndex}
                className="inventory-slot"
                onClick={() => handleEquip(item)} // clique pour équiper
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
