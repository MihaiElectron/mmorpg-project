/**
 * CharacterLayer.jsx
 * ---------------------------------------------------------------------------
 * Rôle :
 * - Affiche les informations du personnage (nom, stats, portrait, etc.).
 * - Ce composant est inclus DANS CharacterLayout.
 *
 * Emplacement :
 * apps/client/src/components/CharacterLayer/CharacterLayer.jsx
 *
 * Dépendances :
 * - Zustand (useCharacterStore) pour récupérer le personnage courant.
 *
 * Remarques :
 * - Ne gère PAS l’ouverture/fermeture du layout.
 * - Ne gère PAS la position : c’est le rôle de CharacterLayout.
 * ---------------------------------------------------------------------------
 */

import { useCharacterStore } from "../../store/character.store";

export default function CharacterLayer() {
  const character = useCharacterStore((s) => s.character);

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

  // Crée un mapping slot → item équipé (ou null)
  const equipmentMap = {};
  slots.forEach((slot) => {
    // Vérifie si l'équipement existe dans ce slot
    const equipped = character.equipment?.find((eq) => eq.slot === slot);
    equipmentMap[slot] = equipped?.item || null;
  });

  return (
    <div className="character-layer">
      {/* Portrait du personnage */}
      <div className={`character-layer__character character--${character.sex}`}></div>

      {/* Boucle sur tous les slots pour afficher l’équipement */}
      {slots.map((slot) => {
        const item = equipmentMap[slot];

        return (
          <div key={slot} className={`character-layer__slot slot--${slot}`}>
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
