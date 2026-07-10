/**
 * CharacterLayer.jsx
 */
import { useState } from "react";
import { useCharacterStore } from "../../store/character.store";
import { formatItemTooltip } from "../Inventory/itemTooltip";

const SLOT_PAIRS = [
  ["left-earring", "right-earring"],
  ["left-ring", "right-ring"],
  ["left-bracelet", "right-bracelet"],
];

function isSlotCompatible(itemSlot, targetSlot) {
  if (!itemSlot) return false;
  if (itemSlot === targetSlot) return true;
  const pair = SLOT_PAIRS.find((p) => p.includes(itemSlot));
  return Boolean(pair && pair.includes(targetSlot));
}

export default function CharacterLayer() {
  const character = useCharacterStore((s) => s.character);
  const unequipItem = useCharacterStore((s) => s.unequipItem);
  const equipment = useCharacterStore((s) => s.equipment);
  const equipItem = useCharacterStore((s) => s.equipItem);
  const dragEquipSource = useCharacterStore((s) => s.dragEquipSource);
  const setDragEquipSource = useCharacterStore((s) => s.setDragEquipSource);
  const clearDragEquipSource = useCharacterStore((s) => s.clearDragEquipSource);
  const [dragOverSlot, setDragOverSlot] = useState(null);

  if (!character) {
    return <div className="character-layer__loading">Chargement du personnage...</div>;
  }

  // Ressources courantes (live via character_resource_update, Skills V1-J-C).
  // Les max sont des stats DÉRIVÉES serveur (jamais recalculées ici) ; fallback
  // à 0 pour toute valeur absente afin de ne jamais afficher "undefined".
  const derived = character.stats?.derived ?? {};
  const health = character.health ?? 0;
  const maxHealth = Math.round(derived.maxHealth ?? character.maxHealth ?? 0);
  const mana = character.mana ?? 0;
  const maxMana = Math.round(derived.maxMana ?? 0);
  const energy = character.energy ?? 0;
  const maxEnergy = Math.round(derived.maxEnergy ?? 0);

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

  function handleDragStartFromSlot(event, slot, item) {
    const payload = JSON.stringify({
      slot,
      instanceId: item.instanceId ?? null,
      itemId: item.id,
    });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-equipment-slot", payload);
    setDragEquipSource({ type: "equipment", slot, instanceId: item.instanceId ?? null });
  }

  function handleDragEndFromSlot() {
    clearDragEquipSource();
    setDragOverSlot(null);
  }

  function handleSlotDragOver(event, slot) {
    if (!event.dataTransfer.types.includes("application/x-inventory-item")) return;
    event.preventDefault();
    const src = dragEquipSource;
    const valid = !src || !src.itemSlot || isSlotCompatible(src.itemSlot, slot);
    event.dataTransfer.dropEffect = valid ? "move" : "none";
    setDragOverSlot({ slot, valid });
  }

  function handleSlotDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDragOverSlot(null);
    }
  }

  function handleSlotDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setDragOverSlot(null);
    if (!event.dataTransfer.types.includes("application/x-inventory-item")) return;
    const raw = event.dataTransfer.getData("application/x-inventory-item");
    if (!raw) return;
    try {
      const { instanceId, itemId } = JSON.parse(raw);
      const id = instanceId ?? itemId;
      if (id) equipItem(id);
    } catch (e) {
      console.error("[CharacterLayer] slot drop parse error", e);
    }
  }

  return (
    <div className="character-layer-container">
      <div className="character-layer-header">
        <div className="character-layer-header__name">{character.name}</div>
        <div className="character-layer-header__stats">
          Niveau {character.level} | XP: {character.experience ?? 0} / {character.nextLevelXp ?? "—"}
        </div>
        <div className="character-layer-header__resources">
          <span className="character-resource character-resource--hp">
            <span className="character-resource__label">PV</span>
            <span className="character-resource__value">{health} / {maxHealth}</span>
          </span>
          <span className="character-resource character-resource--mana">
            <span className="character-resource__label">Mana</span>
            <span className="character-resource__value">{mana} / {maxMana}</span>
          </span>
          <span className="character-resource character-resource--energy">
            <span className="character-resource__label">Énergie</span>
            <span className="character-resource__value">{energy} / {maxEnergy}</span>
          </span>
        </div>
      </div>

      <div className="character-layer">
        {/* Portrait du personnage */}
        <div className={`character-layer__character character--${character.sex}`}></div>

        {/* Boucle sur tous les slots pour afficher l'équipement */}
        {slots.map((slot) => {
          const item = equipment ? equipment[slot] : null;
          const over = dragOverSlot?.slot === slot;
          const overClass = over
            ? dragOverSlot.valid
              ? item
                ? " character-layer__slot--drag-over-swap"
                : " character-layer__slot--drag-over-valid"
              : " character-layer__slot--drag-over-invalid"
            : "";

          return (
            <div
              key={slot}
              className={`character-layer__slot slot--${slot}${item ? " character-layer__slot--filled" : ""}${overClass}`}
              draggable={Boolean(item)}
              onDragStart={item ? (e) => handleDragStartFromSlot(e, slot, item) : undefined}
              onDragEnd={item ? handleDragEndFromSlot : undefined}
              onDragOver={(e) => handleSlotDragOver(e, slot)}
              onDragLeave={handleSlotDragLeave}
              onDrop={(e) => handleSlotDrop(e)}
              onDoubleClick={() => handleUnequip(slot)}
              title={
                item
                  ? formatItemTooltip(item, { actionHint: "Double-clic pour déséquiper · Glisser vers l'inventaire" })
                  : `Slot ${slot} vide`
              }
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
