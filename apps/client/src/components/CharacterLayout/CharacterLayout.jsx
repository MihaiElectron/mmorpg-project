/**
 * CharacterLayout.jsx
 * -----------------------------------------------------------------------------
 * Conteneur principal du layout personnage + inventaire
 * - Onglet demi-cercle pour ouvrir/fermer le panneau
 * - Affiche le CharacterLayer (personnage + équipement)
 * - Affiche un inventaire de 18 slots (désormais délégué à Inventory.jsx)
 *
 * Emplacement :
 * apps/client/src/components/CharacterLayout/CharacterLayout.jsx
 *
 * Dépendances :
 * - useCharacterStore : Zustand pour personnage, équipement et inventaire
 * - Inventory.jsx : composant dédié à l'affichage et la logique UI de l'inventaire
 *
 * Fonctionnalités :
 * - Double-clic sur un item de l'inventaire l'équipe dans le slot approprié
 * - Double-clic sur un slot équipé le retourne dans l'inventaire
 * -----------------------------------------------------------------------------
 */

import CharacterLayer from "../CharacterLayer/CharacterLayer";
import Inventory from "../Inventory/Inventory";
import { useCharacterStore } from "../../store/character.store";

export default function CharacterLayout() {
  // ---------------------------------------------------------------------------
  // Etat du panneau et actions
  // ---------------------------------------------------------------------------
  const isOpen = useCharacterStore((s) => s.isOpen);
  const toggleOpen = useCharacterStore((s) => s.toggleOpen);

  // ---------------------------------------------------------------------------
  // Inventaire et équipement depuis le store
  // (L'affichage est désormais géré par Inventory.jsx)
  // ---------------------------------------------------------------------------
  const inventory = useCharacterStore((s) => s.inventory);
  const equipItem = useCharacterStore((s) => s.equipItem);

  // ---------------------------------------------------------------------------
  // Fonction pour équiper un item depuis l'inventaire dans son slot
  // (Cette logique reste ici car elle concerne le personnage)
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
          Section inventaire
          - Désormais entièrement géré par Inventory.jsx
          - On lui passe :
            - inventory : tableau d'objets { id, quantity, equipped, item }
            - onEquip : callback pour équiper un item
          --------------------------------------------------------------------- */}
      <div className="character-layout__inventory">
        <Inventory inventory={inventory} onEquip={handleEquip} />
      </div>
    </div>
  );
}
