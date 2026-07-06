/**
 * CharacterEquipmentView — vue équipement réutilisable.
 * ----------------------------------------------------------------------------
 * Réutilise les classes SCSS `character-layer__*` du panneau joueur.
 *
 * Deux modes :
 * - read-only (défaut) : aucun drag/drop, aucun store.
 * - `editable` (miroir admin) : drag/drop UI uniquement (source déséquipement,
 *   cible équipement). Aucune logique métier ici — l'intention `onEquip` est
 *   remontée au parent qui émet vers le serveur (autorité unique).
 */
import { useState } from "react";
import { ADMIN_EQ_DND, ADMIN_INV_DND } from "./InventoryGridView";

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

const SLOT_PAIRS: [string, string][] = [
  ["left-earring", "right-earring"],
  ["left-ring", "right-ring"],
  ["left-bracelet", "right-bracelet"],
];

function isSlotCompatible(itemSlot: string | null | undefined, targetSlot: string): boolean {
  if (!itemSlot) return false;
  if (itemSlot === targetSlot) return true;
  const pair = SLOT_PAIRS.find((p) => p.includes(itemSlot));
  return Boolean(pair && pair.includes(targetSlot));
}

export interface EquipmentSlotItem {
  name: string | null;
  image: string | null;
  itemInstanceId?: string | null;
  itemId?: string | null;
  objectMode?: string | null;
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
  /** Active le drag/drop admin. */
  editable?: boolean;
  /** Équipe une instance d'inventaire vers un slot cible. */
  onEquip?: (instanceId: string, targetSlot: string) => void;
  /** Double-clic sur un slot équipé (confort : déséquiper vers l'inventaire). */
  onSlotDoubleClick?: (slot: string) => void;
}

export default function CharacterEquipmentView({
  character,
  equipmentBySlot,
  editable = false,
  onEquip,
  onSlotDoubleClick,
}: CharacterEquipmentViewProps) {
  const [overSlot, setOverSlot] = useState<string | null>(null);

  function handleDragStart(event: React.DragEvent, slot: string, item: EquipmentSlotItem) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      ADMIN_EQ_DND,
      JSON.stringify({ slot, itemInstanceId: item.itemInstanceId ?? null, itemId: item.itemId ?? null }),
    );
  }

  function handleDragOver(event: React.DragEvent, slot: string) {
    if (!event.dataTransfer.types.includes(ADMIN_INV_DND)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setOverSlot(slot);
  }

  function handleDragLeave(event: React.DragEvent) {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOverSlot(null);
  }

  function handleDrop(event: React.DragEvent, targetSlot: string) {
    event.preventDefault();
    event.stopPropagation();
    setOverSlot(null);
    if (!event.dataTransfer.types.includes(ADMIN_INV_DND)) return;
    const raw = event.dataTransfer.getData(ADMIN_INV_DND);
    if (!raw) return;
    try {
      const { instanceId, itemSlot } = JSON.parse(raw);
      // Seules les instances sont équipables (equip-instance). Compat vérifiée
      // aussi côté serveur — ici filtrage best-effort pour éviter un aller-retour.
      if (instanceId && isSlotCompatible(itemSlot, targetSlot) && onEquip) {
        onEquip(instanceId, targetSlot);
      }
    } catch {
      /* payload invalide : ignoré */
    }
  }

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
          const over = editable && overSlot === slot;
          return (
            <div
              key={slot}
              className={[
                "character-layer__slot",
                `slot--${slot}`,
                item ? "character-layer__slot--filled" : "",
                over ? "character-layer__slot--drag-over-valid" : "",
              ].filter(Boolean).join(" ")}
              title={item?.name ? `${slot} : ${item.name}` : `Slot ${slot} vide`}
              draggable={editable && Boolean(item)}
              onDragStart={editable && item ? (e) => handleDragStart(e, slot, item) : undefined}
              onDragOver={editable ? (e) => handleDragOver(e, slot) : undefined}
              onDragLeave={editable ? handleDragLeave : undefined}
              onDrop={editable ? (e) => handleDrop(e, slot) : undefined}
              onDoubleClick={editable && item && onSlotDoubleClick ? () => onSlotDoubleClick(slot) : undefined}
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
