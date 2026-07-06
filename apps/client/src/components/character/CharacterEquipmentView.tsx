/**
 * CharacterEquipmentView — présentation PURE (props uniquement), read-only.
 * ----------------------------------------------------------------------------
 * Réutilise les classes SCSS `character-layer__*` du panneau joueur pour un
 * rendu fidèle (portrait + slots + attaque/défense). Aucun store, aucun fetch,
 * aucun drag/drop : composant réutilisable côté admin en lecture seule.
 */

// Ordre des slots identique au panneau joueur (classes `slot--<slot>`).
const SLOTS = [
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

export interface EquipmentSlotItem {
  name: string | null;
  image: string | null;
}

export interface CharacterEquipmentViewProps {
  character: {
    name: string;
    sex?: string | null;
    level: number;
    health: number;
    maxHealth: number;
    experience?: number;
    attack: number;
    defense: number;
  };
  /** Équipement indexé par slot (ex. "right-hand" → { name, image }). */
  equipmentBySlot: Record<string, EquipmentSlotItem | null | undefined>;
}

export default function CharacterEquipmentView({
  character,
  equipmentBySlot,
}: CharacterEquipmentViewProps) {
  return (
    <div className="character-layer-container">
      <div className="character-layer-header">
        <div className="character-layer-header__name">{character.name}</div>
        <div className="character-layer-header__stats">
          Niveau {character.level} | PV: {character.health} / {character.maxHealth} | XP:{" "}
          {character.experience ?? 0}
        </div>
      </div>

      <div className="character-layer">
        <div className={`character-layer__character character--${character.sex ?? "male"}`}></div>

        {SLOTS.map((slot) => {
          const item = equipmentBySlot[slot] ?? null;
          return (
            <div
              key={slot}
              className={`character-layer__slot slot--${slot}${item ? " character-layer__slot--filled" : ""}`}
              title={item?.name ? `${slot} : ${item.name}` : `Slot ${slot} vide`}
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

      <div className="character-layer__stats-panel">
        <div className="character-layer__stat">
          <span className="character-layer__stat-label">Attaque</span>
          <span className="character-layer__stat-value character-layer__stat-value--attack">
            {character.attack ?? 0}
          </span>
        </div>
        <div className="character-layer__stat">
          <span className="character-layer__stat-label">Défense</span>
          <span className="character-layer__stat-value character-layer__stat-value--defense">
            {character.defense ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
}
