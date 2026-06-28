import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../item-instances/entities/item-instance.entity';
import { WorldItem, WorldItemState } from '../world-items/entities/world-item.entity';
import type { LootEntry } from '../world/loot.service';

export type MaterializationSource =
  | 'LOOT'
  | 'CRAFT'
  | 'QUEST'
  | 'VENDOR'
  | 'ADMIN'
  | 'EVENT'
  | 'CHEST';

export type MaterializeDestination =
  | { type: 'INVENTORY'; characterId: string }
  | {
      type: 'WORLD';
      worldX: number;
      worldY: number;
      mapId: number;
      ownerCharacterId?: string | null;
    };

export interface MaterializeContext {
  source: MaterializationSource;
  destination: MaterializeDestination;
  ownerId: string;
}

export interface MaterializationResult {
  stacks: Inventory[];
  instances: ItemInstance[];
  worldItems: WorldItem[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class ItemMaterializationService {
  /**
   * Matérialise une liste d'entrées loot dans la destination indiquée.
   * Doit être appelé à l'intérieur d'une transaction ouverte par l'appelant.
   * Ne crée jamais sa propre transaction.
   */
  async materialize(
    manager: EntityManager,
    entries: LootEntry[],
    context: MaterializeContext,
  ): Promise<MaterializationResult> {
    const result: MaterializationResult = { stacks: [], instances: [], worldItems: [] };

    for (const entry of entries) {
      if (entry.quantity <= 0) continue;

      const item = await this.resolveItem(manager, entry.itemId);
      if (!item) {
        console.warn(`[ItemMaterializationService] item introuvable: ${entry.itemId}`);
        continue;
      }

      if (item.objectMode === ObjectMode.STACKABLE) {
        if (context.destination.type === 'INVENTORY') {
          const stack = await this.addStack(manager, item, entry.quantity, context.destination.characterId);
          result.stacks.push(stack);
        } else {
          const wi = await this.spawnStackWorldItem(manager, item, entry.quantity, context.destination);
          result.worldItems.push(wi);
        }
      } else {
        // INSTANCE — create one ItemInstance per unit
        for (let i = 0; i < entry.quantity; i++) {
          if (context.destination.type === 'INVENTORY') {
            const inst = await this.spawnInstanceInventory(manager, item, context);
            result.instances.push(inst);
          } else {
            const { instance, worldItem } = await this.spawnInstanceWorld(manager, item, context);
            result.instances.push(instance);
            result.worldItems.push(worldItem);
          }
        }
      }
    }

    return result;
  }

  private async resolveItem(manager: EntityManager, itemRef: string): Promise<Item | null> {
    if (UUID_RE.test(itemRef)) {
      const item = await manager.findOne(Item, { where: { id: itemRef } });
      if (item) return item;
    }
    const material = await manager.findOne(Item, { where: { category: itemRef, type: 'material' } });
    if (material) return material;
    return manager.findOne(Item, { where: [{ type: itemRef }, { category: itemRef }] });
  }

  private async addStack(
    manager: EntityManager,
    item: Item,
    quantity: number,
    characterId: string,
  ): Promise<Inventory> {
    const existing = await manager.findOne(Inventory, {
      where: { character: { id: characterId }, item: { id: item.id } },
      relations: ['item'],
    });
    if (existing) {
      existing.quantity += quantity;
      const saved = await manager.save(Inventory, existing);
      saved.item = item;
      return saved;
    }
    const newRow = manager.create(Inventory, {
      character: { id: characterId } as any,
      item,
      quantity,
      equipped: false,
    });
    const saved = await manager.save(Inventory, newRow);
    saved.item = item;
    return saved;
  }

  private async spawnStackWorldItem(
    manager: EntityManager,
    item: Item,
    quantity: number,
    destination: Extract<MaterializeDestination, { type: 'WORLD' }>,
  ): Promise<WorldItem> {
    const wi = manager.create(WorldItem, {
      itemId: item.id,
      item,
      quantity,
      worldX: destination.worldX,
      worldY: destination.worldY,
      mapId: destination.mapId,
      state: WorldItemState.SPAWNED,
      ownerCharacterId: destination.ownerCharacterId ?? null,
      expiresAt: null,
    });
    const saved = await manager.save(WorldItem, wi);
    saved.item = item;
    return saved;
  }

  private async spawnInstanceInventory(
    manager: EntityManager,
    item: Item,
    context: MaterializeContext,
  ): Promise<ItemInstance> {
    const destination = context.destination as Extract<MaterializeDestination, { type: 'INVENTORY' }>;
    const instance = manager.create(ItemInstance, {
      itemId: item.id,
      ownerId: context.ownerId,
      ownerType: 'CHARACTER',
      state: ItemInstanceState.AVAILABLE,
      containerType: ItemInstanceContainerType.INVENTORY,
      containerId: destination.characterId,
      createdBySource: context.source,
    });
    return manager.save(ItemInstance, instance);
  }

  private async spawnInstanceWorld(
    manager: EntityManager,
    item: Item,
    context: MaterializeContext,
  ): Promise<{ instance: ItemInstance; worldItem: WorldItem }> {
    const destination = context.destination as Extract<MaterializeDestination, { type: 'WORLD' }>;

    // Create WorldItem first (itemInstanceId will be backfilled)
    const wi = manager.create(WorldItem, {
      itemId: item.id,
      item,
      quantity: 1,
      worldX: destination.worldX,
      worldY: destination.worldY,
      mapId: destination.mapId,
      state: WorldItemState.SPAWNED,
      ownerCharacterId: destination.ownerCharacterId ?? null,
      expiresAt: null,
    });
    const savedWi = await manager.save(WorldItem, wi);

    // Create ItemInstance with containerId pointing to the WorldItem
    const instance = manager.create(ItemInstance, {
      itemId: item.id,
      ownerId: context.ownerId,
      ownerType: 'CHARACTER',
      state: ItemInstanceState.IN_WORLD,
      containerType: ItemInstanceContainerType.WORLD,
      containerId: savedWi.id,
      createdBySource: context.source,
    });
    const savedInstance = await manager.save(ItemInstance, instance);

    // Backfill itemInstanceId on WorldItem to satisfy invariant I1
    savedWi.itemInstanceId = savedInstance.id;
    savedWi.item = item;
    await manager.save(WorldItem, savedWi);

    return { instance: savedInstance, worldItem: savedWi };
  }
}
