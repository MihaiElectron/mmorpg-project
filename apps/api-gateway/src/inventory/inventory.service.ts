/**
 * InventoryService
 * -----------------------------------------------------------------------------
 * Service backend pour gérer l’inventaire d’un personnage.
 * - Ajout / suppression / équipement / déséquipement des items
 * - Récupération de l’inventaire complet
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  // ---------------------------------------------------------------------------
  // Ajouter un item dans l'inventaire
  // ---------------------------------------------------------------------------
  async addItem(dto: CreateInventoryDto): Promise<Inventory> {
    const character = await this.characterRepository.findOneBy({ id: dto.characterId });
    if (!character) throw new NotFoundException('Character not found');

    const item = await this.itemRepository.findOneBy({ id: dto.itemId });
    if (!item) throw new NotFoundException('Item not found');

    // Vérifie si l'item existe déjà pour ce personnage
    let inventory = await this.inventoryRepository.findOne({
      where: { character: { id: dto.characterId }, item: { id: dto.itemId } },
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

    return this.inventoryRepository.save(inventory);
  }

  // ---------------------------------------------------------------------------
  // Équiper un item depuis l'inventaire
  // ---------------------------------------------------------------------------
  async equipItem(characterId: string, itemId: string): Promise<Inventory> {
    const inventory = await this.inventoryRepository.findOne({
      where: { character: { id: characterId }, item: { id: itemId } },
      relations: ['item', 'character'],
    });
    if (!inventory) throw new NotFoundException('Item not in inventory');

    inventory.equipped = true;
    return this.inventoryRepository.save(inventory);
  }

  // ---------------------------------------------------------------------------
  // Déséquiper un item selon le slot
  // ---------------------------------------------------------------------------
  async unequipItem(characterId: string, slot: string): Promise<Inventory> {
    const inventory = await this.inventoryRepository
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.item', 'item')
      .leftJoinAndSelect('inv.character', 'character')
      .where('character.id = :characterId', { characterId })
      .andWhere('item.slot = :slot', { slot })
      .getOne();

    if (!inventory) throw new NotFoundException('Item not equipped in slot');

    inventory.equipped = false;
    return this.inventoryRepository.save(inventory);
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
