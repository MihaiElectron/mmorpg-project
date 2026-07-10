import { CharacterEquipment } from '../../characters/entities/character-equipment.entity';
import { ItemInstance, ItemInstanceType } from '../../item-instances/entities/item-instance.entity';
import { Item } from '../../items/entities/item.entity';
import { Inventory } from '../entities/inventory.entity';
import { InventoryEntryDto, ItemSummary } from './inventory-entry.dto';

/**
 * Résumé item exposé à l'inventaire (Équipement V1-B). Champs BRUTS de l'Item,
 * aucun recalcul : le tooltip client n'affiche que ce que l'item porte en base.
 */
export function mapItemSummary(item: Item): ItemSummary {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    category: item.category,
    image: item.image ?? null,
    objectMode: item.objectMode,
    slot: item.slot ?? null,
    attack: item.attack ?? null,
    defense: item.defense ?? null,
    range: item.range ?? null,
    weaponType: item.weaponType ?? null,
    statBonuses: item.statBonuses ?? {},
    requiredLevel: item.requiredLevel ?? 1,
    requiredClass: item.requiredClass ?? null,
    requiredMasteries: item.requiredMasteries ?? {},
  };
}

export interface EquippedSets {
  equippedItemIds: Set<string>;
  equippedInstanceIds: Set<string>;
}

export function buildEquippedSets(equipment: CharacterEquipment[]): EquippedSets {
  const equippedItemIds = new Set(equipment.map((e) => e.itemId));
  const equippedInstanceIds = new Set(
    equipment
      .filter((e) => e.itemInstanceId != null)
      .map((e) => e.itemInstanceId as string),
  );
  return { equippedItemIds, equippedInstanceIds };
}

export function mapStackToEntry(inv: Inventory, sets: EquippedSets): InventoryEntryDto {
  return {
    id: inv.id,
    instanceId: null,
    quantity: inv.quantity,
    equipped: sets.equippedItemIds.has(inv.item.id),
    slotIndex: inv.slotIndex ?? null,
    item: mapItemSummary(inv.item),
  };
}

export function mapInstanceToEntry(
  instance: ItemInstance,
  item: Item,
  sets: EquippedSets,
): InventoryEntryDto {
  const quantity = instance.instanceType === ItemInstanceType.LOT
    ? (instance.quantity ?? 1)
    : 1;
  return {
    id: instance.id,
    instanceId: instance.id,
    quantity,
    equipped: sets.equippedInstanceIds.has(instance.id),
    slotIndex: instance.slotIndex ?? null,
    item: mapItemSummary(item),
  };
}
