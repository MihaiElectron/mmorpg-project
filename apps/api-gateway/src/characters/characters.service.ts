/**
 * CharactersService
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Contient la logique métier liée aux personnages (CRUD + équipement).
 * - Interagit avec la base de données via les repositories Character et
 *   CharacterEquipment.
 *
 * Emplacement :
 * mmorpg-project/apps/api-gateway/src/characters/characters.service.ts
 *
 * Méthodes :
 * - create()     → créer un personnage
 * - findAll()    → lister tous les personnages
 * - findOne()    → récupérer un personnage par ID
 * - update()     → mettre à jour un personnage
 * - remove()     → supprimer un personnage
 * - equipItem()  → équiper un item dans un slot donné
 *
 * Notes :
 * - Les repositories sont injectés via TypeORM.
 * - equipItem() gère la création ou mise à jour du slot d’équipement.
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
import { EquipmentSlot } from './enums/equipment-slot.enum';

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
      throw new NotFoundException(`Personnage #${id} introuvable`);
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
  // Équipement
  // ---------------------------------------------------------------------------

  /**
   * Équipe un item dans un slot donné pour un personnage.
   * Étapes :
   * 1. Vérifier que le personnage existe
   * 2. Valider le slot via l'enum EQUIPMENT_SLOT
   * 3. Charger ou créer le slot d'équipement
   * 4. Assigner l'item
   * 5. Sauvegarder
   * 6. Retourner le personnage mis à jour
   */
  async equipItem(characterId: number, dto: EquipItemDto) {
    const { slot, itemId } = dto;

    // 1. Vérifier que le personnage existe
    const character = await this.characterRepository.findOne({
      where: { id: characterId },
      relations: ['equipment'],
    });

    if (!character) {
      throw new NotFoundException(`Personnage #${characterId} introuvable`);
    }

    // 2. Valider le slot
    const validSlots = Object.values(EquipmentSlot);
    if (!validSlots.includes(slot)) {
      throw new Error(`Slot d'équipement invalide : ${slot}`);
    }

    // 3. Trouver ou créer le slot d'équipement
    let equipmentSlot = character.equipment.find((e) => e.slot === slot);

    if (!equipmentSlot) {
      equipmentSlot = this.equipmentRepository.create({
        character,
        slot,
        itemId: null,
      });
    }

    // 4. Assigner l'item
    equipmentSlot.itemId = itemId;

    // 5. Sauvegarder
    await this.equipmentRepository.save(equipmentSlot);

    // 6. Retourner le personnage mis à jour
    return this.characterRepository.findOne({
      where: { id: characterId },
      relations: ['equipment'],
    });
  }
}
