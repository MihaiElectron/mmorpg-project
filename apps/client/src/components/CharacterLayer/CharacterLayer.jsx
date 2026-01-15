/**
 * CharacterLayer.jsx
 * ---------------------------------------------------------------------------
 * Rôle :
 * - Affiche les informations du personnage (nom, stats, portrait, etc.).
 * - Affiche les slots d'équipement avec double-clic pour déséquiper.
 * - Ce composant est inclus DANS CharacterLayout.
 *
 * Emplacement :
 * apps/client/src/components/CharacterLayer/CharacterLayer.jsx
 *
 * Dépendances :
 * - Zustand (useCharacterStore) pour récupérer le personnage et l'équipement.
 *
 * Fonctionnalités :
 * - Double-clic sur un slot équipé retourne l'item dans l'inventaire
 * ---------------------------------------------------------------------------
 */

import { useCharacterStore } from "../../store/character.store";

export default function CharacterLayer() {
  const character = useCharacterStore((s) => s.character);
  const unequipItem = useCharacterStore((s) => s.unequipItem);
  const equipment = useCharacterStore((s) => s.equipment);

  if (!character) return null;

  // Liste de tous les slots disponibles dans le layer
  const slots = [
    "left-earring",
    "right-earring",
    "headgear",
    "ranged-weapon",
    "necklace",
    "chest-armor",
    "left-bracelet",
    "right-hand",
    "left-hand",
    "gloves",
    "right-bracelet",
    "leg-armor",
    "left-ring",
    "right-ring",
    "boots",
    "bag",
  ];

  // Crée un mapping slot → item équipé (ou null) depuis le store
  const equipmentMap = {};
  slots.forEach((slot) => {
    equipmentMap[slot] = equipment[slot] || null;
  });

  // Handler double-clic pour déséquiper
  const handleUnequip = (slot) => {
    if (equipmentMap[slot]) {
      unequipItem(slot);
    }
  };

  return (
    <div className="character-layer">
      {/* Portrait du personnage */}
      <div className={`character-layer__character character--${character.sex}`}></div>

      {/* Boucle sur tous les slots pour afficher l'équipement */}
      {slots.map((slot) => {
        const item = equipmentMap[slot];

        return (
          <div
            key={slot}
            className={`character-layer__slot slot--${slot}`}
            onDoubleClick={() => handleUnequip(slot)}
            title={item ? `Double-clic pour déséquiper ${item.name}` : "Slot vide"}
          >
            {/* Affiche l'image de l'item seulement si elle existe */}
            {item?.image ? (
              <img
                src={item.image}
                alt={item.name || "equipment"}
                className="character-layer__item-image"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
