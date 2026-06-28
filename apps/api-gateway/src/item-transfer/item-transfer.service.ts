import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../item-instances/entities/item-instance.entity';

// ── Intentions métier ─────────────────────────────────────────────────────────
// Chaque type encode ce que le domaine veut faire, pas l'état cible.
// Le service est la seule autorité qui traduit intention → (state, containerType, containerId).

export type ItemTransition =
  | { type: 'EQUIP'; characterId: string }
  | { type: 'UNEQUIP'; characterId: string }
  | { type: 'DROP_TO_WORLD'; worldItemId: string }
  | { type: 'PICKUP_FROM_WORLD'; worldItemId: string; characterId: string }
  | { type: 'ARCHIVE'; worldItemId: string }
  | { type: 'LIST_FOR_AUCTION'; listingId: string }
  | { type: 'SELL_AUCTION'; listingId: string }
  | { type: 'CLAIM_BUYER'; listingId: string; buyerCharacterId: string }
  | { type: 'RETURN_TO_SELLER'; listingId: string; sellerCharacterId: string };

export interface TransferContext {
  requesterId: string | null; // null autorisé pour les opérations système (ARCHIVE)
  transition: ItemTransition;
}

@Injectable()
export class ItemTransferService {
  /**
   * Point d'entrée unique pour toutes les transitions Runtime d'une ItemInstance.
   * Pose le verrou pessimiste. Ne crée jamais sa propre transaction.
   */
  async transfer(
    manager: EntityManager,
    itemInstanceId: string,
    context: TransferContext,
  ): Promise<ItemInstance> {
    const instance = await this.lockInstance(manager, itemInstanceId);
    const { requesterId, transition } = context;

    switch (transition.type) {
      case 'EQUIP':
        return this.applyEquip(manager, instance, requesterId, transition.characterId);
      case 'UNEQUIP':
        return this.applyUnequip(manager, instance, requesterId, transition.characterId);
      case 'DROP_TO_WORLD':
        return this.applyDropToWorld(manager, instance, requesterId, transition.worldItemId);
      case 'PICKUP_FROM_WORLD':
        return this.applyPickupFromWorld(manager, instance, requesterId, transition);
      case 'ARCHIVE':
        return this.applyArchive(manager, instance, transition.worldItemId);
      case 'LIST_FOR_AUCTION':
        return this.applyListForAuction(manager, instance, requesterId, transition.listingId);
      case 'SELL_AUCTION':
        return this.applySellAuction(manager, instance, transition.listingId);
      case 'CLAIM_BUYER':
        return this.applyClaimBuyer(manager, instance, transition);
      case 'RETURN_TO_SELLER':
        return this.applyReturnToSeller(manager, instance, transition);
    }
  }

  // ── Lock ───────────────────────────────────────────────────────────────────

  private async lockInstance(manager: EntityManager, instanceId: string): Promise<ItemInstance> {
    const instance = await manager
      .getRepository(ItemInstance)
      .createQueryBuilder('i')
      .setLock('pessimistic_write')
      .where('i.id = :id', { id: instanceId })
      .getOne();
    if (!instance) throw new NotFoundException(`ItemInstance ${instanceId} not found`);
    return instance;
  }

  // ── Validations ────────────────────────────────────────────────────────────

  private validateOwner(instance: ItemInstance, requesterId: string | null): void {
    if (requesterId !== null && instance.ownerId !== requesterId) {
      throw new BadRequestException(`Instance ${instance.id} does not belong to requester`);
    }
  }

  private validateState(instance: ItemInstance, expected: ItemInstanceState): void {
    if (instance.state !== expected) {
      throw new BadRequestException(
        `Expected state ${expected}, got ${instance.state}`,
      );
    }
  }

  private validateContainer(
    instance: ItemInstance,
    expectedType: ItemInstanceContainerType,
    expectedId?: string,
  ): void {
    if (instance.containerType !== expectedType) {
      throw new BadRequestException(
        `Expected container ${expectedType}, got ${instance.containerType}`,
      );
    }
    if (expectedId !== undefined && instance.containerId !== expectedId) {
      throw new BadRequestException(
        `Expected containerId ${expectedId}, got ${instance.containerId}`,
      );
    }
  }

  // ── Transitions ────────────────────────────────────────────────────────────

  private async applyEquip(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    characterId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    this.validateState(instance, ItemInstanceState.AVAILABLE);
    this.validateContainer(instance, ItemInstanceContainerType.INVENTORY);

    instance.state = ItemInstanceState.EQUIPPED;
    instance.containerType = ItemInstanceContainerType.EQUIPMENT;
    instance.containerId = characterId;
    return manager.save(ItemInstance, instance);
  }

  private async applyUnequip(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    characterId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    this.validateState(instance, ItemInstanceState.EQUIPPED);
    this.validateContainer(instance, ItemInstanceContainerType.EQUIPMENT);

    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = characterId;
    return manager.save(ItemInstance, instance);
  }

  private async applyDropToWorld(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    worldItemId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    if (instance.state === ItemInstanceState.EQUIPPED) {
      throw new BadRequestException('Cannot drop an equipped instance');
    }
    this.validateState(instance, ItemInstanceState.AVAILABLE);
    this.validateContainer(instance, ItemInstanceContainerType.INVENTORY);

    instance.state = ItemInstanceState.IN_WORLD;
    instance.containerType = ItemInstanceContainerType.WORLD;
    instance.containerId = worldItemId;
    return manager.save(ItemInstance, instance);
  }

  private async applyPickupFromWorld(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    transition: Extract<ItemTransition, { type: 'PICKUP_FROM_WORLD' }>,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    this.validateState(instance, ItemInstanceState.IN_WORLD);
    this.validateContainer(instance, ItemInstanceContainerType.WORLD, transition.worldItemId);

    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = transition.characterId;
    return manager.save(ItemInstance, instance);
  }

  private async applyArchive(
    manager: EntityManager,
    instance: ItemInstance,
    worldItemId: string,
  ): Promise<ItemInstance> {
    this.validateState(instance, ItemInstanceState.IN_WORLD);
    this.validateContainer(instance, ItemInstanceContainerType.WORLD, worldItemId);

    instance.state = ItemInstanceState.ARCHIVED;
    instance.containerType = ItemInstanceContainerType.NONE;
    instance.containerId = null;
    return manager.save(ItemInstance, instance);
  }

  // ── Auction transitions ───────────────────────────────────────────────────

  private async applyListForAuction(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    listingId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    this.validateState(instance, ItemInstanceState.AVAILABLE);
    this.validateContainer(instance, ItemInstanceContainerType.INVENTORY);

    instance.state = ItemInstanceState.LISTED;
    instance.containerType = ItemInstanceContainerType.AUCTION;
    instance.containerId = listingId;
    return manager.save(ItemInstance, instance);
  }

  private async applySellAuction(
    manager: EntityManager,
    instance: ItemInstance,
    listingId: string,
  ): Promise<ItemInstance> {
    this.validateState(instance, ItemInstanceState.LISTED);
    this.validateContainer(instance, ItemInstanceContainerType.AUCTION, listingId);

    instance.state = ItemInstanceState.SOLD_PENDING_CLAIM;
    return manager.save(ItemInstance, instance);
  }

  private async applyClaimBuyer(
    manager: EntityManager,
    instance: ItemInstance,
    transition: Extract<ItemTransition, { type: 'CLAIM_BUYER' }>,
  ): Promise<ItemInstance> {
    this.validateState(instance, ItemInstanceState.SOLD_PENDING_CLAIM);
    this.validateContainer(instance, ItemInstanceContainerType.AUCTION, transition.listingId);

    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = transition.buyerCharacterId;
    instance.ownerId = transition.buyerCharacterId;
    return manager.save(ItemInstance, instance);
  }

  private async applyReturnToSeller(
    manager: EntityManager,
    instance: ItemInstance,
    transition: Extract<ItemTransition, { type: 'RETURN_TO_SELLER' }>,
  ): Promise<ItemInstance> {
    this.validateState(instance, ItemInstanceState.LISTED);
    this.validateContainer(instance, ItemInstanceContainerType.AUCTION, transition.listingId);

    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = transition.sellerCharacterId;
    return manager.save(ItemInstance, instance);
  }
}
