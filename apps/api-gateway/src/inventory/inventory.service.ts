/**
 * InventoryService
 * -----------------------------------------------------------------------------
 * Service backend pour gérer l’inventaire d’un personnage.
 * - Ajout / suppression / équipement / déséquipement des items
 * - Récupération de l’inventaire complet
 */

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { Inventory } from './entities/inventory.entity';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { Character } from '../characters/entities/character.entity';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { ItemInstance, ItemInstanceContainerType, ItemInstanceState } from '../item-instances/entities/item-instance.entity';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { recalculateEquipmentStats } from '../characters/equipment-stats.helper';
import { WorldService } from '../world/world.service';
import { InventoryProjectionService } from './projection/inventory-projection.service';
import { InventoryEntryDto } from './projection/inventory-entry.dto';
import { UpdateInventorySlotsDto } from './dto/update-inventory-slots.dto';

const SLOT_PAIRS: [string, string][] = [
  ['left-earring', 'right-earring'],
  ['left-ring', 'right-ring'],
  ['left-bracelet', 'right-bracelet'],
];

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,

    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,

    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,

    @InjectRepository(CharacterEquipment)
    private readonly equipmentRepository: Repository<CharacterEquipment>,

    @InjectRepository(ItemInstance)
    private readonly instanceRepository: Repository<ItemInstance>,

    private readonly dataSource: DataSource,
    private readonly itemTransfer: ItemTransferService,
    private readonly worldService: WorldService,
    private readonly inventoryProjection: InventoryProjectionService,
  ) {}

  /**
   * Réordonne les positions visuelles (slotIndex) de l'inventaire d'un
   * personnage. LECTURE/écriture STRICTEMENT limitée à slotIndex : ne touche
   * ni ownership, ni container, ni state, ni quantité, ne crée/supprime rien.
   * Serveur autoritaire : ownership vérifié, ids validés, doublons refusés.
   */
  async updateSlots(
    characterId: string,
    userId: string,
    dto: UpdateInventorySlotsDto,
  ): Promise<InventoryEntryDto[]> {
    const character = await this.characterRepository.findOneBy({ id: characterId });
    if (!character || character.userId !== userId) {
      throw new ForbiddenException('Personnage introuvable ou accès refusé.');
    }
    return this.applySlotUpdates(characterId, dto);
  }

  /**
   * Variante ADMIN de {@link updateSlots} : le rôle admin est vérifié en amont
   * (gateway), on ne filtre donc PAS par userId joueur. Toute la validation
   * métier (appartenance stack/instance au personnage, container, doublons)
   * reste appliquée par {@link applySlotUpdates}. Retourne la projection fraîche.
   */
  async updateSlotsAsAdmin(
    characterId: string,
    dto: UpdateInventorySlotsDto,
  ): Promise<InventoryEntryDto[]> {
    const character = await this.characterRepository.findOneBy({ id: characterId });
    if (!character) throw new NotFoundException(`Personnage "${characterId}" introuvable.`);
    return this.applySlotUpdates(characterId, dto);
  }

  /**
   * Cœur transactionnel de la réécriture des slotIndex, SANS contrôle d'accès
   * (l'appelant — joueur ou admin — l'a déjà fait). Ne touche que slotIndex,
   * jamais ownership/container/state/quantité, ne crée/supprime rien. Émet
   * l'invalidation admin et retourne la projection fraîche.
   */
  private async applySlotUpdates(
    characterId: string,
    dto: UpdateInventorySlotsDto,
  ): Promise<InventoryEntryDto[]> {
    // Pas de doublon de slotIndex dans le payload.
    const seen = new Set<number>();
    for (const e of dto.entries) {
      if (seen.has(e.slotIndex)) {
        throw new BadRequestException(`slotIndex dupliqué: ${e.slotIndex}`);
      }
      seen.add(e.slotIndex);
    }

    await this.dataSource.transaction(async (manager) => {
      for (const e of dto.entries) {
        if (e.kind === 'stack') {
          const inv = await manager.findOne(Inventory, {
            where: { id: e.id },
            relations: ['character'],
          });
          if (!inv || inv.character?.id !== characterId) {
            throw new BadRequestException(`Stack ${e.id} n'appartient pas au personnage.`);
          }
          inv.slotIndex = e.slotIndex; // seule mutation
          await manager.save(Inventory, inv);
        } else {
          const inst = await manager.findOne(ItemInstance, { where: { id: e.id } });
          if (
            !inst ||
            inst.ownerId !== characterId ||
            inst.containerType !== ItemInstanceContainerType.INVENTORY ||
            inst.state === ItemInstanceState.EQUIPPED ||
            inst.state === ItemInstanceState.DESTROYED
          ) {
            throw new BadRequestException(`Instance ${e.id} invalide ou hors inventaire du personnage.`);
          }
          inst.slotIndex = e.slotIndex; // seule mutation
          await manager.save(ItemInstance, inst);
        }
      }
    });

    // Miroir admin live (pas de nouveau socket). Le client appelant resynchronise
    // depuis la projection fraîche retournée.
    this.worldService.emitAdminCharacterDirty(characterId, 'inventory');
    return this.inventoryProjection.project(characterId);
  }

  /**
   * Garde d'ownership commune aux endpoints joueur : le personnage doit
   * exister et appartenir à l'utilisateur authentifié (JWT). Ne pas utiliser
   * pour les chemins admin (rôle vérifié en amont par la gateway).
   */
  private async assertCharacterOwnership(
    characterId: string,
    userId: string,
  ): Promise<Character> {
    const character = await this.characterRepository.findOneBy({
      id: characterId,
    });
    if (!character || character.userId !== userId) {
      throw new ForbiddenException('Personnage introuvable ou accès refusé.');
    }
    return character;
  }

  // ---------------------------------------------------------------------------
  // Ajouter un item dans l'inventaire
  // ---------------------------------------------------------------------------
  async addItem(dto: CreateInventoryDto, userId: string): Promise<Inventory> {
    const character = await this.assertCharacterOwnership(
      dto.characterId,
      userId,
    );

    const item = await this.findItemForLoot(dto.itemId);
    if (!item) throw new NotFoundException('Item not found');

    // Vérifie si l'item existe déjà pour ce personnage
    let inventory = await this.inventoryRepository.findOne({
      where: { character: { id: dto.characterId }, item: { id: item.id } },
      relations: ['item'],
    });

    if (inventory) {
      inventory.quantity += dto.quantity;
    } else {
      inventory = this.inventoryRepository.create({
        character,
        item,
        quantity: dto.quantity,
        equipped: dto.equipped ?? false,
      });
    }

    const saved = await this.inventoryRepository.save(inventory);

    return this.inventoryRepository.findOneOrFail({
      where: { id: saved.id },
      relations: ['item'],
    });
  }

  private async findItemForLoot(itemRef: string): Promise<Item | null> {
    if (this.isUuid(itemRef)) {
      const item = await this.itemRepository.findOneBy({ id: itemRef });
      if (item) return item;
    }

    // Priorité aux items de type 'material' : évite l'ambiguïté quand plusieurs
    // items partagent la même category (ex. earring, earring +1, earring +2).
    const material = await this.itemRepository.findOne({
      where: { category: itemRef, type: 'material' },
    });
    if (material) return material;

    return this.itemRepository.findOne({
      where: [{ type: itemRef }, { category: itemRef }],
    });
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  // ---------------------------------------------------------------------------
  // Équiper une ItemInstance depuis l'inventaire
  // Transition AVAILABLE/INVENTORY → EQUIPPED/EQUIPMENT. Crée CharacterEquipment
  // avec itemInstanceId. Ne touche pas Inventory.equipped.
  // Si le slot avait un item legacy, met son Inventory.equipped à false.
  // Si le slot avait une autre instance, la retransitionne AVAILABLE/INVENTORY.
  // ---------------------------------------------------------------------------
  async equipItemInstance(characterId: string, instanceId: string, userId: string): Promise<ItemInstance> {
    const character = await this.characterRepository.findOneBy({ id: characterId });
    if (!character || character.userId !== userId) {
      throw new ForbiddenException('Personnage introuvable ou accès refusé.');
    }
    const equippedResult = await this.equipInstanceTransaction(characterId, instanceId);
    // Invalidation live du Player Inspector admin (equip INSTANCE).
    this.worldService.emitAdminCharacterDirty(characterId, 'equipment');
    return equippedResult;
  }

  /**
   * Variante ADMIN de {@link equipItemInstance} : rôle vérifié en amont (gateway),
   * pas de filtre userId joueur. `requestedSlot` optionnel : si fourni il est
   * validé compatible (même slot ou paire L/R) avant usage ; sinon résolution
   * automatique L/R. Passe par le même cœur métier (ItemTransferService + EQUIP +
   * recalculateEquipmentStats). Retourne la projection fraîche.
   */
  async equipItemInstanceAsAdmin(
    characterId: string,
    instanceId: string,
    requestedSlot?: string | null,
  ): Promise<InventoryEntryDto[]> {
    const character = await this.characterRepository.findOneBy({ id: characterId });
    if (!character) throw new NotFoundException(`Personnage "${characterId}" introuvable.`);
    await this.equipInstanceTransaction(characterId, instanceId, requestedSlot ?? undefined);
    this.worldService.emitAdminCharacterDirty(characterId, 'equipment');
    return this.inventoryProjection.project(characterId);
  }

  /**
   * Cœur transactionnel de l'équipement d'une ItemInstance, SANS contrôle
   * d'accès (l'appelant l'a déjà fait). `requestedSlot` optionnel force le slot
   * cible (validé compatible avec item.slot) au lieu de la résolution L/R.
   */
  private async equipInstanceTransaction(
    characterId: string,
    instanceId: string,
    requestedSlot?: string,
  ): Promise<ItemInstance> {
    return this.dataSource.transaction(async (manager) => {
      // Lecture sans verrou pour résoudre itemId/slot (itemId est immuable)
      const rawInstance = await manager.findOne(ItemInstance, { where: { id: instanceId } });
      if (!rawInstance) throw new NotFoundException(`ItemInstance ${instanceId} not found`);
      if (rawInstance.ownerId !== characterId) {
        throw new BadRequestException(`Instance ${instanceId} n'appartient pas au personnage ${characterId}.`);
      }

      const item = await manager.findOne(Item, { where: { id: rawInstance.itemId } });
      if (!item) throw new NotFoundException('Item not found');
      if (!item.slot) throw new BadRequestException('Item has no slot defined');

      let targetSlot: string;
      if (requestedSlot) {
        if (!this.isSlotCompatible(item.slot, requestedSlot)) {
          throw new BadRequestException(
            `Slot "${requestedSlot}" incompatible avec l'item (slot natif "${item.slot}").`,
          );
        }
        targetSlot = requestedSlot;
      } else {
        targetSlot = await this.resolveEquipSlot(manager, characterId, item.slot);
      }

      const existing = await manager.findOne(CharacterEquipment, {
        where: { characterId, slot: targetSlot },
      });
      if (existing) {
        if (existing.itemInstanceId) {
          await this.itemTransfer.transfer(manager, existing.itemInstanceId, {
            requesterId: characterId,
            transition: { type: 'UNEQUIP', characterId },
          });
        } else {
          const oldInv = await manager.findOne(Inventory, {
            where: { character: { id: characterId }, item: { id: existing.itemId } },
          });
          if (oldInv) {
            oldInv.equipped = false;
            await manager.save(Inventory, oldInv);
          }
        }
        await manager.delete(CharacterEquipment, { characterId, slot: targetSlot });
      }

      const equipment = manager.create(CharacterEquipment, {
        characterId,
        itemId: item.id,
        slot: targetSlot,
        itemInstanceId: rawInstance.id,
      });
      await manager.save(CharacterEquipment, equipment);

      // Validation owner/state/container + verrou dans ItemTransferService
      const equipped = await this.itemTransfer.transfer(manager, instanceId, {
        requesterId: characterId,
        transition: { type: 'EQUIP', characterId },
      });
      await recalculateEquipmentStats(manager, characterId);
      return equipped;
    });
  }

  /**
   * Compatibilité item.slot ↔ slot cible : identique, ou membre de la même
   * paire gauche/droite (earring, ring, bracelet). Miroir de la règle client.
   */
  private isSlotCompatible(itemSlot: string, targetSlot: string): boolean {
    if (itemSlot === targetSlot) return true;
    const pair = SLOT_PAIRS.find((p) => p.includes(itemSlot));
    return Boolean(pair && pair.includes(targetSlot));
  }

  private async resolveEquipSlot(
    manager: EntityManager,
    characterId: string,
    itemSlot: string,
  ): Promise<string> {
    const pair = SLOT_PAIRS.find((p) => p.includes(itemSlot));
    if (!pair) return itemSlot;
    for (const slot of pair) {
      const occupied = await manager.findOne(CharacterEquipment, { where: { characterId, slot } });
      if (!occupied) return slot;
    }
    return pair[0];
  }

  // ---------------------------------------------------------------------------
  // Équiper un item depuis l'inventaire (legacy — itemId catalogue)
  // Crée une ligne CharacterEquipment (source de vérité).
  // Met aussi à jour Inventory.equipped (transitoire — requis par WorldItemService.findInventoryForUpdate).
  // ---------------------------------------------------------------------------
  async equipItem(
    characterId: string,
    itemId: string,
    userId: string,
  ): Promise<Inventory> {
    await this.assertCharacterOwnership(characterId, userId);
    const item = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);
    if (!item.slot) throw new BadRequestException('Item has no slot defined');
    // Un item INSTANCE ne doit jamais passer par le chemin legacy (par itemId) :
    // il créerait un CharacterEquipment sans itemInstanceId et laisserait
    // l'ItemInstance non transitionnée (desync EQUIPPED/AVAILABLE).
    if (item.objectMode === ObjectMode.INSTANCE) {
      throw new BadRequestException(
        'Cet item est de type INSTANCE : utiliser equip-instance (POST /inventory/:characterId/equip-instance/:instanceId).',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Retire l'équipement existant dans ce slot (s'il y en a un)
      const existing = await manager.findOne(CharacterEquipment, {
        where: { characterId, slot: item.slot },
      });
      if (existing) {
        await manager.delete(CharacterEquipment, { characterId, slot: item.slot });
        const oldInv = await manager.findOne(Inventory, {
          where: { character: { id: characterId }, item: { id: existing.itemId } },
        });
        if (oldInv) {
          oldInv.equipped = false;
          await manager.save(Inventory, oldInv);
        }
      }

      // Crée le nouvel équipement
      const equipment = manager.create(CharacterEquipment, {
        characterId,
        itemId: item.id,
        slot: item.slot,
      });
      await manager.save(CharacterEquipment, equipment);

      // Met à jour Inventory.equipped pour compat WorldItemService (transitoire)
      const inv = await manager.findOne(Inventory, {
        where: { character: { id: characterId }, item: { id: item.id } },
        relations: ['item'],
      });
      if (!inv) throw new NotFoundException('Item not in inventory');
      inv.equipped = true;
      return manager.save(Inventory, inv);
    });
  }

  // ---------------------------------------------------------------------------
  // Déséquiper un item selon le slot
  // Supprime la ligne CharacterEquipment (source de vérité).
  // — Si CharacterEquipment.itemInstanceId est set : transition AVAILABLE/INVENTORY (chemin INSTANCE).
  // — Sinon : met à jour Inventory.equipped à false (chemin legacy stack).
  // ---------------------------------------------------------------------------
  async unequipItem(
    characterId: string,
    slot: string,
    userId: string,
  ): Promise<Inventory | ItemInstance> {
    await this.assertCharacterOwnership(characterId, userId);
    return this.unequipItemCore(characterId, slot);
  }

  /**
   * Cœur du déséquipement, SANS contrôle d'ownership : l'appelant (joueur via
   * {@link unequipItem}, admin via {@link unequipItemAsAdmin}) l'a déjà fait.
   */
  private async unequipItemCore(
    characterId: string,
    slot: string,
  ): Promise<Inventory | ItemInstance> {
    const result = await this.dataSource.transaction(async (manager) => {
      const equipment = await manager.findOne(CharacterEquipment, {
        where: { characterId, slot },
      });
      if (!equipment) throw new NotFoundException(`No item equipped in slot ${slot}`);

      await manager.delete(CharacterEquipment, { characterId, slot });

      if (equipment.itemInstanceId) {
        const instance = await this.itemTransfer.transfer(manager, equipment.itemInstanceId, {
          requesterId: characterId,
          transition: { type: 'UNEQUIP', characterId },
        });
        await recalculateEquipmentStats(manager, characterId);
        return instance;
      }

      const inv = await manager.findOne(Inventory, {
        where: { character: { id: characterId }, item: { id: equipment.itemId } },
        relations: ['item'],
      });
      if (!inv) throw new NotFoundException('Inventory row not found for equipped item');
      inv.equipped = false;
      const saved = await manager.save(Inventory, inv);
      await recalculateEquipmentStats(manager, characterId);
      return saved;
    });
    // Invalidation live du Player Inspector admin (unequip).
    this.worldService.emitAdminCharacterDirty(characterId, 'equipment');
    return result;
  }

  /**
   * Variante ADMIN du déséquipement : rôle vérifié en amont (gateway).
   * Réutilise {@link unequipItemCore} (ItemTransferService + recalculateEquipmentStats).
   * Si `targetSlotIndex` est fourni, applique ensuite ce slotIndex à l'item
   * déséquipé via {@link applySlotUpdates} (transactionnel). Retourne la
   * projection fraîche.
   */
  async unequipItemAsAdmin(
    characterId: string,
    slot: string,
    targetSlotIndex?: number | null,
  ): Promise<InventoryEntryDto[]> {
    const character = await this.characterRepository.findOneBy({ id: characterId });
    if (!character) throw new NotFoundException(`Personnage "${characterId}" introuvable.`);

    const result = await this.unequipItemCore(characterId, slot); // dirty('equipment')

    if (targetSlotIndex != null && Number.isInteger(targetSlotIndex) && targetSlotIndex >= 0) {
      const kind = result instanceof ItemInstance ? 'instance' : 'stack';
      await this.applySlotUpdates(characterId, {
        entries: [{ kind, id: result.id, slotIndex: targetSlotIndex }],
      });
    }

    return this.inventoryProjection.project(characterId);
  }

  // ---------------------------------------------------------------------------
  // Récupérer l'inventaire complet d'un personnage
  // ---------------------------------------------------------------------------
  async getInventory(
    characterId: string,
    userId: string,
  ): Promise<Inventory[]> {
    await this.assertCharacterOwnership(characterId, userId);
    return this.inventoryRepository.find({
      where: { character: { id: characterId } },
      relations: ['item'],
    });
  }
}
