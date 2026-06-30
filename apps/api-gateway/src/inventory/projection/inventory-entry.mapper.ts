import { CharacterEquipment } from '../../characters/entities/character-equipment.entity';
import { ItemInstance, ItemInstanceType } from '../../item-instances/entities/item-instance.entity';
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
    instanceId: null,
    quantity: inv.quantity,
    equipped: sets.equippedItemIds.has(inv.item.id),
    item: {
      id: inv.item.id,
      name: inv.item.name,
      type: inv.item.type,
      category: inv.item.category,
      image: inv.item.image ?? null,
      objectMode: inv.item.objectMode,
    },
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
    item: {
      id: item.id,
      name: item.name,
      type: item.type,
      category: item.category,
      image: item.image ?? null,
      objectMode: item.objectMode,
    },
  };
}
