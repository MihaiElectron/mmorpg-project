import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, In, Repository } from 'typeorm';
import { Inventory } from '../entities/inventory.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../../item-instances/entities/item-instance.entity';
import { InventoryEntryResolution } from './inventory-entry-resolution';

const INACTIVE_STATES = [ItemInstanceState.DESTROYED, ItemInstanceState.ARCHIVED];

@Injectable()
export class InventoryEntryResolverService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(ItemInstance)
    private readonly instanceRepository: Repository<ItemInstance>,
  ) {}

  async resolve(characterId: string, inventoryEntryId: string): Promise<InventoryEntryResolution> {
    const instance = await this.instanceRepository.findOne({
      where: {
        id: inventoryEntryId,
        ownerId: characterId,
        containerType: ItemInstanceContainerType.INVENTORY,
        state: Not(In(INACTIVE_STATES)),
      },
    });
    if (instance) {
      return { type: 'INSTANCE', instance, itemId: instance.itemId };
    }

    const inventory = await this.inventoryRepository.findOne({
      where: { id: inventoryEntryId, character: { id: characterId } },
      relations: ['item'],
    });
    if (inventory) {
      return { type: 'STACK', inventory, itemId: inventory.item.id };
    }

    throw new NotFoundException(`Inventory entry ${inventoryEntryId} not found`);
  }

  async resolveWithinTransaction(
    manager: EntityManager,
    characterId: string,
    inventoryEntryId: string,
  ): Promise<InventoryEntryResolution> {
    const instance = await manager.findOne(ItemInstance, {
      where: {
        id: inventoryEntryId,
        ownerId: characterId,
        containerType: ItemInstanceContainerType.INVENTORY,
        state: Not(In(INACTIVE_STATES)),
      },
    });
    if (instance) {
      return { type: 'INSTANCE', instance, itemId: instance.itemId };
    }

    const inventory = await manager.findOne(Inventory, {
      where: { id: inventoryEntryId, character: { id: characterId } },
      relations: ['item'],
    });
    if (inventory) {
      return { type: 'STACK', inventory, itemId: inventory.item.id };
    }

    throw new NotFoundException(`Inventory entry ${inventoryEntryId} not found`);
  }
}
