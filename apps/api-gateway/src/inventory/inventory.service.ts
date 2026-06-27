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
  // Équiper un item depuis l'inventaire
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
  // Met aussi à jour Inventory.equipped (transitoire — requis par WorldItemService.findInventoryForUpdate).
  // ---------------------------------------------------------------------------
  async unequipItem(characterId: string, slot: string): Promise<Inventory> {
    return this.dataSource.transaction(async (manager) => {
      const equipment = await manager.findOne(CharacterEquipment, {
        where: { characterId, slot },
      });
      if (!equipment) throw new NotFoundException(`No item equipped in slot ${slot}`);

      await manager.delete(CharacterEquipment, { characterId, slot });

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
