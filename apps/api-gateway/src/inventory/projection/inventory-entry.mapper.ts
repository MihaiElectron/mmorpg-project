import { CharacterEquipment } from '../../characters/entities/character-equipment.entity';
import { ItemInstance } from '../../item-instances/entities/item-instance.entity';
import { Item } from '../../items/entities/item.entity';
import { Inventory } from '../entities/inventory.entity';
import { InventoryEntryDto } from './inventory-entry.dto';

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
    quantity: inv.quantity,
    equipped: sets.equippedItemIds.has(inv.item.id),
    item: {
      id: inv.item.id,
      name: inv.item.name,
      type: inv.item.type,
      category: inv.item.category,
      image: inv.item.image ?? null,
    },
  };
}

export function mapInstanceToEntry(
  instance: ItemInstance,
  item: Item,
  sets: EquippedSets,
): InventoryEntryDto {
  return {
    id: instance.id,
    quantity: 1,
    equipped: sets.equippedInstanceIds.has(instance.id),
    item: {
      id: item.id,
      name: item.name,
      type: item.type,
      category: item.category,
      image: item.image ?? null,
    },
  };
}
