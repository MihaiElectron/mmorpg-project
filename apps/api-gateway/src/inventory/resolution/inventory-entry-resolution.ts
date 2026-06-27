import { Inventory } from '../entities/inventory.entity';
import { ItemInstance } from '../../item-instances/entities/item-instance.entity';

export type InventoryEntryResolution =
  | { type: 'STACK'; inventory: Inventory; itemId: string }
  | { type: 'INSTANCE'; instance: ItemInstance; itemId: string };
