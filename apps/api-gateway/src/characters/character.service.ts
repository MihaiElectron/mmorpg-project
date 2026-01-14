import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item } from '../items/entities/item.entity';
import { CreateCharacterDto } from './dto/create-character.dto';
import { EquipItemDto, EquipmentSlot } from './dto/equip-item.dto';
import { UnequipItemDto } from './dto/unequip-item.dto';

@Injectable()
export class CharacterService {
  constructor(
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
    @InjectRepository(CharacterEquipment)
    private readonly equipmentRepository: Repository<CharacterEquipment>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Crée un nouveau personnage pour un utilisateur
   */
  async create(userId: string, dto: CreateCharacterDto): Promise<Character> {
    const character = this.characterRepository.create({
      name: dto.name,
      sex: dto.sex,
      userId,
    });
    return this.characterRepository.save(character);
  }

  /**
   * Récupère tous les personnages d'un utilisateur
   */
  async findAllByUser(userId: string): Promise<Character[]> {
    return this.characterRepository.find({
      where: { userId },
      relations: [
        'equipment',
        'equipment.item',
        'inventory',
        'inventory.item',
      ],
    });
  }

  /**
   * Récupère le "premier" personnage d'un utilisateur (pour /characters/me)
   */
  async findFirstByUser(userId: string): Promise<Character> {
    const character = await this.characterRepository.findOne({
      where: { userId },
      relations: [
        'equipment',
        'equipment.item',
        'inventory',
        'inventory.item',
      ],
      order: { createdAt: 'ASC' },
    });

    if (!character) throw new NotFoundException(`No character found for user ${userId}`);
    return character;
  }

  /**
   * Récupère un personnage par son ID (vérifie la propriété)
   */
  async findOne(id: string, userId: string): Promise<Character> {
    const character = await this.characterRepository.findOne({
      where: { id, userId },
      relations: [
        'equipment',
        'equipment.item',
        'inventory',
        'inventory.item',
      ],
    });
    if (!character) throw new NotFoundException(`Character ${id} not found`);
    return character;
  }

  /**
   * Équipe un item sur un personnage
   */
  async equipItem(
    characterId: string,
    userId: string,
    dto: EquipItemDto,
  ): Promise<Character> {
    const character = await this.findOne(characterId, userId);

    const item = await this.itemRepository.findOne({ where: { id: dto.itemId } });
    if (!item) throw new NotFoundException(`Item ${dto.itemId} not found`);

    let finalSlot: EquipmentSlot;
    if (dto.slot) {
      finalSlot = dto.slot;
      if (item.slot && item.slot !== finalSlot)
        throw new BadRequestException(`Item slot (${item.slot}) does not match requested slot (${finalSlot})`);
    } else {
      if (
        item.slot === EquipmentSlot.LEFT_EARRING ||
        item.slot === EquipmentSlot.RIGHT_EARRING
      ) {
        const left = await this.equipmentRepository.findOne({ where: { characterId, slot: EquipmentSlot.LEFT_EARRING } });
        const right = await this.equipmentRepository.findOne({ where: { characterId, slot: EquipmentSlot.RIGHT_EARRING } });
        finalSlot = !left ? EquipmentSlot.LEFT_EARRING : !right ? EquipmentSlot.RIGHT_EARRING : EquipmentSlot.LEFT_EARRING;
      } else {
        if (!item.slot) throw new BadRequestException('Slot is required for this item');
        finalSlot = item.slot;
      }
    }

    return await this.dataSource.transaction(async (manager) => {
      await manager.delete(CharacterEquipment, { characterId, slot: finalSlot });

      const equipment = manager.create(CharacterEquipment, { characterId, itemId: item.id, slot: finalSlot });
      await manager.save(CharacterEquipment, equipment);

      // Mettre à jour Inventory.equipped
      const inventoryEntry = await manager.findOne(Inventory, {
        where: { character: { id: characterId }, item: { id: item.id } },
      });
      if (inventoryEntry) {
        inventoryEntry.equipped = true;
        await manager.save(Inventory, inventoryEntry);
      }

      await this.recalculateStats(characterId, manager);

      const updatedCharacter = await manager.findOne(Character, {
        where: { id: characterId },
        relations: ['equipment', 'equipment.item', 'inventory', 'inventory.item'],
      });
      if (!updatedCharacter) throw new NotFoundException(`Character ${characterId} not found`);
      return updatedCharacter;
    });
  }

  /**
   * Déséquipe un item
   * - Corrige filtrage sur Inventory via queryBuilder
   */
  async unequipItem(
    characterId: string,
    userId: string,
    dto: UnequipItemDto,
  ): Promise<Character> {
    await this.findOne(characterId, userId);

    return await this.dataSource.transaction(async (manager) => {
      // Supprimer de CharacterEquipment
      await manager.delete(CharacterEquipment, { characterId, slot: dto.slot });

      // Mettre à jour Inventory.equipped via queryBuilder
      const inventoryEntry = await manager
        .createQueryBuilder(Inventory, 'inv')
        .leftJoinAndSelect('inv.item', 'item')
        .leftJoinAndSelect('inv.character', 'character')
        .where('character.id = :characterId', { characterId })
        .andWhere('item.slot = :slot', { slot: dto.slot })
        .getOne();

      if (inventoryEntry) {
        inventoryEntry.equipped = false;
        await manager.save(Inventory, inventoryEntry);
      }

      await this.recalculateStats(characterId, manager);

      const updatedCharacter = await manager.findOne(Character, {
        where: { id: characterId },
        relations: ['equipment', 'equipment.item', 'inventory', 'inventory.item'],
      });
      if (!updatedCharacter) throw new NotFoundException(`Character ${characterId} not found`);
      return updatedCharacter;
    });
  }

  /**
   * Recalcule les stats du personnage (placeholder)
   */
  private async recalculateStats(characterId: string, manager: EntityManager): Promise<void> {
    // Placeholder → peut être étendu pour calculer les stats totales en fonction des équipements
  }

  /**
   * Supprime un personnage
   */
  async remove(id: string, userId: string): Promise<void> {
    const character = await this.findOne(id, userId);
    await this.characterRepository.remove(character);
  }
}
