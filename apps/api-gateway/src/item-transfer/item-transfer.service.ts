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
  | { type: 'ARCHIVE'; worldItemId: string };

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
}
