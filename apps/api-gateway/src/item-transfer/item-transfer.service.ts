import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceSource,
  ItemInstanceState,
  ItemInstanceType,
} from '../item-instances/entities/item-instance.entity';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';

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
  | { type: 'RETURN_TO_SELLER'; listingId: string; sellerCharacterId: string }
  | { type: 'STORE_BANK'; characterId: string }
  | { type: 'WITHDRAW_BANK'; characterId: string }
  | { type: 'SEND_MAIL'; mailId: string }
  | { type: 'CLAIM_MAIL'; mailId: string; recipientCharacterId: string }
  | { type: 'STORE_GUILD'; guildId: string }
  | { type: 'WITHDRAW_GUILD'; guildId: string; characterId: string }
  | { type: 'STORE_HOUSE'; houseId: string }
  | { type: 'WITHDRAW_HOUSE'; houseId: string; characterId: string }
  | { type: 'AUCTION_TO_MAIL'; listingId: string; mailId: string }
  | { type: 'TRADE_LOCK'; tradeSessionId: string }
  | { type: 'TRADE_COMMIT'; tradeSessionId: string; recipientCharacterId: string }
  | { type: 'TRADE_CANCEL'; tradeSessionId: string }
  | { type: 'CRAFT_CONSUME'; characterId: string }
  | { type: 'ADMIN_DESTROY' }
  | { type: 'REPAIR_ORPHAN_EQUIPPED' };

export interface TransferContext {
  requesterId: string | null; // null autorisé pour les opérations système (ARCHIVE)
  transition: ItemTransition;
}

export interface CreateLotInput {
  itemId: string;
  quantity: number;
  listingId: string;
  sellerCharacterId: string;
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
      case 'STORE_BANK':
        return this.applyStoreBank(manager, instance, requesterId, transition.characterId);
      case 'WITHDRAW_BANK':
        return this.applyWithdrawBank(manager, instance, requesterId, transition.characterId);
      case 'SEND_MAIL':
        return this.applySendMail(manager, instance, requesterId, transition.mailId);
      case 'CLAIM_MAIL':
        return this.applyClaimMail(manager, instance, transition);
      case 'STORE_GUILD':
        return this.applyStoreGuild(manager, instance, requesterId, transition.guildId);
      case 'WITHDRAW_GUILD':
        return this.applyWithdrawGuild(manager, instance, transition);
      case 'STORE_HOUSE':
        return this.applyStoreHouse(manager, instance, requesterId, transition.houseId);
      case 'WITHDRAW_HOUSE':
        return this.applyWithdrawHouse(manager, instance, transition);
      case 'AUCTION_TO_MAIL':
        return this.applyAuctionToMail(manager, instance, transition.listingId, transition.mailId);
      case 'TRADE_LOCK':
        return this.applyTradeLock(manager, instance, requesterId, transition.tradeSessionId);
      case 'TRADE_COMMIT':
        return this.applyTradeCommit(manager, instance, transition);
      case 'TRADE_CANCEL':
        return this.applyTradeCancel(manager, instance, transition.tradeSessionId);
      case 'CRAFT_CONSUME':
        return this.applyCraftConsume(manager, instance, requesterId, transition.characterId);
      case 'ADMIN_DESTROY':
        return this.applyAdminDestroy(manager, instance);
      case 'REPAIR_ORPHAN_EQUIPPED':
        return this.applyRepairOrphanEquipped(manager, instance);
    }
  }

  /**
   * Répare une ItemInstance EQUIPPED orpheline (maintenance DevTools) :
   * une instance restée EQUIPPED/EQUIPMENT alors qu'aucune ligne
   * character_equipment ne la référence (desync). La remet AVAILABLE/INVENTORY
   * chez son propriétaire.
   * Refuse si l'instance est encore réellement équipée (ligne character_equipment
   * présente), si elle n'est pas EQUIPPED/EQUIPMENT, ou si ownerId est absent.
   */
  private async applyRepairOrphanEquipped(
    manager: EntityManager,
    instance: ItemInstance,
  ): Promise<ItemInstance> {
    if (instance.state !== ItemInstanceState.EQUIPPED) {
      throw new BadRequestException(
        `Instance non EQUIPPED (etat ${instance.state}) : rien a reparer.`,
      );
    }
    if (instance.containerType !== ItemInstanceContainerType.EQUIPMENT) {
      throw new BadRequestException(
        `Instance non dans le container EQUIPMENT (${instance.containerType}) : rien a reparer.`,
      );
    }
    if (!instance.ownerId) {
      throw new BadRequestException('Instance sans ownerId : reparation impossible.');
    }

    const linked = await manager.getRepository(CharacterEquipment).count({
      where: { itemInstanceId: instance.id },
    });
    if (linked > 0) {
      throw new BadRequestException(
        'Instance encore referencee par character_equipment : desequiper normalement, pas de reparation.',
      );
    }

    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = instance.ownerId;
    return manager.save(ItemInstance, instance);
  }

  /**
   * Destruction administrative d'une ItemInstance (maintenance DevTools).
   * Marque DESTROYED plutot qu'un hard delete (tracabilite preservee).
   * Refuse une instance encore active dans un flux metier : EQUIPPED,
   * LISTED (auction) ou IN_MAIL — l'admin doit d'abord resoudre ce flux.
   */
  private async applyAdminDestroy(
    manager: EntityManager,
    instance: ItemInstance,
  ): Promise<ItemInstance> {
    const blocked: ItemInstanceState[] = [
      ItemInstanceState.EQUIPPED,
      ItemInstanceState.LISTED,
      ItemInstanceState.IN_MAIL,
    ];
    if (blocked.includes(instance.state)) {
      throw new BadRequestException(
        `Impossible de detruire une instance a l'etat ${instance.state} : resoudre d'abord le flux metier (equip/auction/mail).`,
      );
    }
    if (instance.state === ItemInstanceState.DESTROYED) {
      throw new BadRequestException('Instance deja detruite.');
    }

    instance.state = ItemInstanceState.DESTROYED;
    instance.containerType = ItemInstanceContainerType.NONE;
    instance.containerId = null;
    return manager.save(ItemInstance, instance);
  }

  /**
   * Consommation d'une ItemInstance NORMAL comme ingrédient de craft.
   * Transition INVENTORY/AVAILABLE/NORMAL → DESTROYED (jamais de hard delete,
   * traçabilité préservée). L'appelant (CraftingService) a déjà verrouillé et
   * sélectionné l'instance ; on revalide ici propriétaire, état, container et
   * type avant de détruire.
   */
  private async applyCraftConsume(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    characterId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    if (instance.ownerId !== characterId) {
      throw new BadRequestException(
        `Instance ${instance.id} does not belong to character ${characterId}`,
      );
    }
    if (instance.instanceType !== ItemInstanceType.NORMAL) {
      throw new BadRequestException('Cannot consume a non-NORMAL item instance');
    }
    this.validateState(instance, ItemInstanceState.AVAILABLE);
    this.validateContainer(instance, ItemInstanceContainerType.INVENTORY, characterId);

    instance.state = ItemInstanceState.DESTROYED;
    instance.containerType = ItemInstanceContainerType.NONE;
    instance.containerId = null;
    return manager.save(ItemInstance, instance);
  }

  /**
   * Crée un Market Lot à partir du stock Inventory d'un personnage.
   * Seule voie autorisée pour créer un ItemInstance de type LOT.
   * Ne crée jamais sa propre transaction — opère dans celle de l'appelant.
   */
  async createLot(manager: EntityManager, input: CreateLotInput): Promise<ItemInstance> {
    // 1. Charger l'item et valider STACKABLE
    const item = await manager.findOne(Item, { where: { id: input.itemId } });
    if (!item) throw new NotFoundException(`Item ${input.itemId} not found`);
    if (item.objectMode !== ObjectMode.STACKABLE) {
      throw new BadRequestException('Only STACKABLE items can be listed as a market lot');
    }

    // 2. Verrou pessimiste sur la ligne Inventory
    const inventory = await manager
      .getRepository(Inventory)
      .createQueryBuilder('inv')
      .setLock('pessimistic_write')
      .where('inv.characterId = :characterId AND inv.itemId = :itemId', {
        characterId: input.sellerCharacterId,
        itemId: input.itemId,
      })
      .getOne();

    if (!inventory || inventory.quantity < input.quantity) {
      throw new BadRequestException('Insufficient inventory');
    }

    // 3. Décrémenter le stock
    inventory.quantity -= input.quantity;
    await manager.save(Inventory, inventory);

    // 4. Créer le LOT ItemInstance
    const lot = manager.create(ItemInstance, {
      instanceType: ItemInstanceType.LOT,
      quantity: input.quantity,
      itemId: input.itemId,
      state: ItemInstanceState.LISTED,
      containerType: ItemInstanceContainerType.AUCTION,
      containerId: input.listingId,
      ownerId: input.sellerCharacterId,
      ownerType: 'character',
      createdBySource: ItemInstanceSource.MARKET_LOT,
    });

    return manager.save(ItemInstance, lot);
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
    if (instance.instanceType !== ItemInstanceType.NORMAL) {
      throw new BadRequestException('Cannot equip a LOT item instance');
    }
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

  private async applyAuctionToMail(
    manager: EntityManager,
    instance: ItemInstance,
    listingId: string,
    mailId: string,
  ): Promise<ItemInstance> {
    this.validateState(instance, ItemInstanceState.LISTED);
    this.validateContainer(instance, ItemInstanceContainerType.AUCTION, listingId);

    instance.state = ItemInstanceState.IN_MAIL;
    instance.containerType = ItemInstanceContainerType.MAIL;
    instance.containerId = mailId;
    return manager.save(ItemInstance, instance);
  }

  // ── Bank transitions ──────────────────────────────────────────────────────

  private async applyStoreBank(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    characterId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    this.validateState(instance, ItemInstanceState.AVAILABLE);
    this.validateContainer(instance, ItemInstanceContainerType.INVENTORY);

    instance.state = ItemInstanceState.IN_BANK;
    instance.containerType = ItemInstanceContainerType.BANK;
    instance.containerId = characterId;
    return manager.save(ItemInstance, instance);
  }

  private async applyWithdrawBank(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    characterId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    this.validateState(instance, ItemInstanceState.IN_BANK);
    this.validateContainer(instance, ItemInstanceContainerType.BANK, characterId);

    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = characterId;
    return manager.save(ItemInstance, instance);
  }

  // ── Mail transitions ──────────────────────────────────────────────────────

  private async applySendMail(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    mailId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    this.validateState(instance, ItemInstanceState.AVAILABLE);
    this.validateContainer(instance, ItemInstanceContainerType.INVENTORY);

    instance.state = ItemInstanceState.IN_MAIL;
    instance.containerType = ItemInstanceContainerType.MAIL;
    instance.containerId = mailId;
    return manager.save(ItemInstance, instance);
  }

  private async applyClaimMail(
    manager: EntityManager,
    instance: ItemInstance,
    transition: Extract<ItemTransition, { type: 'CLAIM_MAIL' }>,
  ): Promise<ItemInstance> {
    this.validateState(instance, ItemInstanceState.IN_MAIL);
    this.validateContainer(instance, ItemInstanceContainerType.MAIL, transition.mailId);

    if (instance.instanceType === ItemInstanceType.LOT) {
      // LOT : restituer les unités dans l'Inventory du destinataire, puis détruire le LOT
      const existing = await manager
        .getRepository(Inventory)
        .createQueryBuilder('inv')
        .setLock('pessimistic_write')
        .where('inv.characterId = :characterId AND inv.itemId = :itemId', {
          characterId: transition.recipientCharacterId,
          itemId: instance.itemId,
        })
        .getOne();

      if (existing) {
        existing.quantity += instance.quantity!;
        await manager.save(Inventory, existing);
      } else {
        const newRow = manager.create(Inventory, {
          character: { id: transition.recipientCharacterId } as any,
          item: { id: instance.itemId } as any,
          quantity: instance.quantity!,
          equipped: false,
        });
        await manager.save(Inventory, newRow);
      }

      instance.state = ItemInstanceState.DESTROYED;
      instance.containerType = ItemInstanceContainerType.NONE;
      instance.containerId = null;
      return manager.save(ItemInstance, instance);
    }

    // NORMAL : retour en inventaire du destinataire
    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = transition.recipientCharacterId;
    instance.ownerId = transition.recipientCharacterId;
    return manager.save(ItemInstance, instance);
  }

  // ── Guild Storage transitions ─────────────────────────────────────────────

  private async applyStoreGuild(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    guildId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    this.validateState(instance, ItemInstanceState.AVAILABLE);
    this.validateContainer(instance, ItemInstanceContainerType.INVENTORY);

    instance.state = ItemInstanceState.IN_GUILD_STORAGE;
    instance.containerType = ItemInstanceContainerType.GUILD_STORAGE;
    instance.containerId = guildId;
    return manager.save(ItemInstance, instance);
  }

  private async applyWithdrawGuild(
    manager: EntityManager,
    instance: ItemInstance,
    transition: Extract<ItemTransition, { type: 'WITHDRAW_GUILD' }>,
  ): Promise<ItemInstance> {
    this.validateState(instance, ItemInstanceState.IN_GUILD_STORAGE);
    this.validateContainer(instance, ItemInstanceContainerType.GUILD_STORAGE, transition.guildId);

    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = transition.characterId;
    instance.ownerId = transition.characterId;
    return manager.save(ItemInstance, instance);
  }

  // ── Housing transitions ───────────────────────────────────────────────────

  private async applyStoreHouse(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    houseId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    this.validateState(instance, ItemInstanceState.AVAILABLE);
    this.validateContainer(instance, ItemInstanceContainerType.INVENTORY);

    instance.state = ItemInstanceState.IN_HOUSING;
    instance.containerType = ItemInstanceContainerType.HOUSING;
    instance.containerId = houseId;
    return manager.save(ItemInstance, instance);
  }

  private async applyWithdrawHouse(
    manager: EntityManager,
    instance: ItemInstance,
    transition: Extract<ItemTransition, { type: 'WITHDRAW_HOUSE' }>,
  ): Promise<ItemInstance> {
    this.validateState(instance, ItemInstanceState.IN_HOUSING);
    this.validateContainer(instance, ItemInstanceContainerType.HOUSING, transition.houseId);

    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = transition.characterId;
    instance.ownerId = transition.characterId;
    return manager.save(ItemInstance, instance);
  }

  // ── Trade transitions ─────────────────────────────────────────────────────

  private async applyTradeLock(
    manager: EntityManager,
    instance: ItemInstance,
    requesterId: string | null,
    tradeSessionId: string,
  ): Promise<ItemInstance> {
    this.validateOwner(instance, requesterId);
    this.validateState(instance, ItemInstanceState.AVAILABLE);
    this.validateContainer(instance, ItemInstanceContainerType.INVENTORY);

    instance.state = ItemInstanceState.IN_TRADE;
    instance.containerType = ItemInstanceContainerType.TRADE;
    instance.containerId = tradeSessionId;
    return manager.save(ItemInstance, instance);
  }

  private async applyTradeCommit(
    manager: EntityManager,
    instance: ItemInstance,
    transition: Extract<ItemTransition, { type: 'TRADE_COMMIT' }>,
  ): Promise<ItemInstance> {
    this.validateState(instance, ItemInstanceState.IN_TRADE);
    this.validateContainer(instance, ItemInstanceContainerType.TRADE, transition.tradeSessionId);

    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = transition.recipientCharacterId;
    instance.ownerId = transition.recipientCharacterId;
    return manager.save(ItemInstance, instance);
  }

  private async applyTradeCancel(
    manager: EntityManager,
    instance: ItemInstance,
    tradeSessionId: string,
  ): Promise<ItemInstance> {
    this.validateState(instance, ItemInstanceState.IN_TRADE);
    this.validateContainer(instance, ItemInstanceContainerType.TRADE, tradeSessionId);

    // Retour chez le propriétaire légal (ownerId inchangé depuis TRADE_LOCK)
    instance.state = ItemInstanceState.AVAILABLE;
    instance.containerType = ItemInstanceContainerType.INVENTORY;
    instance.containerId = instance.ownerId;
    return manager.save(ItemInstance, instance);
  }
}
