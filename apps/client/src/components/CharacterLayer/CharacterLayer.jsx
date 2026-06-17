/**
 * CharacterLayer.jsx
 */
import { useCharacterStore } from "../../store/character.store";

export default function CharacterLayer() {
  const character = useCharacterStore((s) => s.character);
  const unequipItem = useCharacterStore((s) => s.unequipItem);
  const equipment = useCharacterStore((s) => s.equipment);

  if (!character) {
    return <div className="character-layer__loading">Chargement du personnage...</div>;
  }

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

  const handleUnequip = (slot) => {
    if (equipment && equipment[slot]) {
      unequipItem(slot);
    }
  };

  return (
    <div className="character-layer-container">
      <div className="character-layer-header">
        <div className="character-layer-header__name">{character.name}</div>
        <div className="character-layer-header__stats">
          Niveau {character.level} | PV: {character.health} / {character.maxHealth}
        </div>
      </div>

      <div className="character-layer">
        {/* Portrait du personnage */}
        <div className={`character-layer__character character--${character.sex}`}></div>

        {/* Boucle sur tous les slots pour afficher l'équipement */}
        {slots.map((slot) => {
          const item = equipment ? equipment[slot] : null;

          return (
            <div
              key={slot}
              className={`character-layer__slot slot--${slot}`}
              onDoubleClick={() => handleUnequip(slot)}
              title={item ? `Double-clic pour déséquiper ${item.name}` : `Slot ${slot} vide`}
            >
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
    </div>
  );
}
