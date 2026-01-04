/**
 * CharactersService
 * -----------------------------------------------------------------------------
 * Role:
 * - Contains the business logic related to characters (CRUD + equipment).
 * - Interacts with the database through Character and CharacterEquipment repositories.
 *
 * Location:
 * mmorpg-project/apps/api-gateway/src/characters/characters.service.ts
 *
 * Methods:
 * - create()     → create a new character
 * - findAll()    → list all characters
 * - findOne()    → get a character by ID
 * - update()     → update a character
 * - remove()     → delete a character
 * - equipItem()  → equip an item in a specific slot (implementation pending)
 *
 * Notes:
 * - The repositories are now injected via TypeORM.
 * - equipItem() will be implemented once item logic and validations are defined.
 * -----------------------------------------------------------------------------
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';

import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { EquipItemDto } from './dto/equip-item.dto';

@Injectable()
export class CharactersService {
  constructor(
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,

    @InjectRepository(CharacterEquipment)
    private readonly equipmentRepository: Repository<CharacterEquipment>,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(dto: CreateCharacterDto) {
    const character = this.characterRepository.create(dto);
    return this.characterRepository.save(character);
  }

  async findAll() {
    return this.characterRepository.find({
      relations: ['equipment'],
    });
  }

  async findOne(id: number) {
    const character = await this.characterRepository.findOne({
      where: { id },
      relations: ['equipment'],
    });

    if (!character) {
      throw new NotFoundException(`Character #${id} not found`);
    }

    return character;
  }

  async update(id: number, dto: UpdateCharacterDto) {
    const character = await this.findOne(id);
    Object.assign(character, dto);
    return this.characterRepository.save(character);
  }

  async remove(id: number) {
    const character = await this.findOne(id);
    return this.characterRepository.remove(character);
  }

  // ---------------------------------------------------------------------------
  // Equipment (implementation later)
  // ---------------------------------------------------------------------------

  /**
   * Equip an item in a specific slot for a character.
   * Implementation will be added once:
   * - item system is defined
   * - slot compatibility rules are defined
   * - item repository is available
   */
  async equipItem(characterId: number, dto: EquipItemDto) {
    return `Equip item ${dto.itemId} in slot ${dto.slot} for character #${characterId}`;
  }
}
