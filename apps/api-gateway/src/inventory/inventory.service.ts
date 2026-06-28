/**
 * InventoryService
 * -----------------------------------------------------------------------------
 * Service backend pour gérer l’inventaire d’un personnage.
 * - Ajout / suppression / équipement / déséquipement des items
 * - Récupération de l’inventaire complet
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { Inventory } from './entities/inventory.entity';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { Character } from '../characters/entities/character.entity';
import { Item } from '../items/entities/item.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../item-instances/entities/item-instance.entity';

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

    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Ajouter un item dans l'inventaire
  // ---------------------------------------------------------------------------
  async addItem(dto: CreateInventoryDto): Promise<Inventory> {
    const character = await this.characterRepository.findOneBy({
      id: dto.characterId,
    });
    if (!character) throw new NotFoundException('Character not found');

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
  async equipItemInstance(characterId: string, instanceId: string): Promise<ItemInstance> {
    return this.dataSource.transaction(async (manager) => {
      const lockedInstance = await manager
        .getRepository(ItemInstance)
        .createQueryBuilder('i')
        .setLock('pessimistic_write')
        .where('i.id = :id', { id: instanceId })
        .getOne();

      if (!lockedInstance) throw new NotFoundException(`ItemInstance ${instanceId} not found`);
      if (lockedInstance.ownerId !== characterId)
        throw new BadRequestException('Instance does not belong to this character');
      if (lockedInstance.containerType !== ItemInstanceContainerType.INVENTORY)
        throw new BadRequestException('Instance is not in inventory');
      if (lockedInstance.state !== ItemInstanceState.AVAILABLE)
        throw new BadRequestException('Instance is not available');

      const item = await manager.findOne(Item, { where: { id: lockedInstance.itemId } });
      if (!item) throw new NotFoundException('Item not found');
      if (!item.slot) throw new BadRequestException('Item has no slot defined');

      const existing = await manager.findOne(CharacterEquipment, {
        where: { characterId, slot: item.slot },
      });
      if (existing) {
        if (existing.itemInstanceId) {
          const oldInstance = await manager.findOne(ItemInstance, {
            where: { id: existing.itemInstanceId },
          });
          if (oldInstance) {
            oldInstance.state = ItemInstanceState.AVAILABLE;
            oldInstance.containerType = ItemInstanceContainerType.INVENTORY;
            oldInstance.containerId = characterId;
            await manager.save(ItemInstance, oldInstance);
          }
        } else {
          const oldInv = await manager.findOne(Inventory, {
            where: { character: { id: characterId }, item: { id: existing.itemId } },
          });
          if (oldInv) {
            oldInv.equipped = false;
            await manager.save(Inventory, oldInv);
          }
        }
        await manager.delete(CharacterEquipment, { characterId, slot: item.slot });
      }

      const equipment = manager.create(CharacterEquipment, {
        characterId,
        itemId: item.id,
        slot: item.slot,
        itemInstanceId: lockedInstance.id,
      });
      await manager.save(CharacterEquipment, equipment);

      lockedInstance.state = ItemInstanceState.EQUIPPED;
      lockedInstance.containerType = ItemInstanceContainerType.EQUIPMENT;
      lockedInstance.containerId = characterId;
      return manager.save(ItemInstance, lockedInstance);
    });
  }

  // ---------------------------------------------------------------------------
  // Équiper un item depuis l'inventaire (legacy — itemId catalogue)
  // Crée une ligne CharacterEquipment (source de vérité).
  // Met aussi à jour Inventory.equipped (transitoire — requis par WorldItemService.findInventoryForUpdate).
  // ---------------------------------------------------------------------------
  async equipItem(characterId: string, itemId: string): Promise<Inventory> {
    const item = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);
    if (!item.slot) throw new BadRequestException('Item has no slot defined');

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
  async unequipItem(characterId: string, slot: string): Promise<Inventory | ItemInstance> {
    return this.dataSource.transaction(async (manager) => {
      const equipment = await manager.findOne(CharacterEquipment, {
        where: { characterId, slot },
      });
      if (!equipment) throw new NotFoundException(`No item equipped in slot ${slot}`);

      await manager.delete(CharacterEquipment, { characterId, slot });

      if (equipment.itemInstanceId) {
        const instance = await manager.findOne(ItemInstance, {
          where: { id: equipment.itemInstanceId },
        });
        if (!instance) throw new NotFoundException('ItemInstance not found for equipped slot');
        instance.state = ItemInstanceState.AVAILABLE;
        instance.containerType = ItemInstanceContainerType.INVENTORY;
        instance.containerId = characterId;
        return manager.save(ItemInstance, instance);
      }

      const inv = await manager.findOne(Inventory, {
        where: { character: { id: characterId }, item: { id: equipment.itemId } },
        relations: ['item'],
      });
      if (!inv) throw new NotFoundException('Inventory row not found for equipped item');
      inv.equipped = false;
      return manager.save(Inventory, inv);
    });
  }

  // ---------------------------------------------------------------------------
  // Récupérer l'inventaire complet d'un personnage
  // ---------------------------------------------------------------------------
  async getInventory(characterId: string): Promise<Inventory[]> {
    return this.inventoryRepository.find({
      where: { character: { id: characterId } },
      relations: ['item'],
    });
  }
}
