/**
 * CharactersService — Version simplifiée pour MVP
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Gère un seul personnage par joueur.
 * - Fournit les opérations CRUD minimales nécessaires au MVP.
 *
 * Notes :
 * - La logique d’équipement sera ajoutée progressivement (étapes suivantes).
 * - Chaque méthode et injection est documentée pour assurer une compréhension
 *   claire et une maintenance simple.
 * -----------------------------------------------------------------------------
 */

import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Character } from './entities/character.entity';
import { CreateCharacterDto } from './dto/create-character.dto';

import { CharacterEquipment } from './entities/character-equipment.entity';
import { EquipItemDto } from './dto/equip-item.dto';
import { EquipmentSlot } from './enums/equipment-slot.enum';

@Injectable()
export class CharactersService {
  constructor(
    @InjectRepository(Character)
    private readonly repo: Repository<Character>,

    @InjectRepository(CharacterEquipment)
    private readonly equipmentRepo: Repository<CharacterEquipment>,
  ) {}

  /**
   * create()
   * ----------------------------------------------------------------------------
   * Crée un nouveau personnage pour un joueur.
   * ----------------------------------------------------------------------------
   */
  async create(dto: CreateCharacterDto, userId: string): Promise<Character> {
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException('Ce joueur possède déjà un personnage.');
    }

    const nameExists = await this.repo.findOne({ where: { name: dto.name } });
    if (nameExists) {
      throw new ConflictException('Ce nom est déjà utilisé.');
    }

    const character = this.repo.create({ ...dto, userId });
    return this.repo.save(character);
  }

  /**
   * findOneByUserId()
   * ----------------------------------------------------------------------------
   * Récupère le personnage associé à un joueur.
   * ----------------------------------------------------------------------------
   */
  async findOneByUserId(userId: string): Promise<Character | null> {
    return this.repo.findOne({
      where: { userId },
      relations: ['equipment'], // tu peux ajouter 'inventory' plus tard
    });
  }

  /**
   * removeForUser()
   * ----------------------------------------------------------------------------
   * Supprime le personnage d’un joueur.
   * ----------------------------------------------------------------------------
   */
  async removeForUser(id: number, userId: string): Promise<void> {
    const character = await this.repo.findOne({ where: { id, userId } });
    if (!character) throw new NotFoundException('Personnage introuvable.');
    await this.repo.remove(character);
  }

  /**
   * equipItemForUser()
   * ----------------------------------------------------------------------------
   * Équipe un item dans un slot donné.
   * ----------------------------------------------------------------------------
   */
  async equipItemForUser(userId: string, dto: EquipItemDto): Promise<CharacterEquipment> {
    const character = await this.findOneByUserId(userId);
    if (!character) {
      throw new NotFoundException('Aucun personnage trouvé pour ce joueur.');
    }

    let slot = await this.equipmentRepo.findOne({
      where: {
        character: { id: character.id },
        slot: dto.slot as EquipmentSlot,
      },
      relations: ['character'],
    });

    if (!slot) {
      slot = this.equipmentRepo.create({
        character,
        slot: dto.slot,
        itemId: dto.itemId,
      });
    } else {
      slot.itemId = dto.itemId;
    }

    return this.equipmentRepo.save(slot);
  }

  /**
   * unequipItemForUser()
   * ----------------------------------------------------------------------------
   * Déséquipe un item d’un slot donné.
   * ----------------------------------------------------------------------------
   */
  async unequipItemForUser(userId: string, slotName: string): Promise<CharacterEquipment> {
    const character = await this.findOneByUserId(userId);
    if (!character) {
      throw new NotFoundException('Aucun personnage trouvé pour ce joueur.');
    }

    const slot = await this.equipmentRepo.findOne({
      where: {
        character: { id: character.id },
        slot: slotName as EquipmentSlot,
      },
      relations: ['character'],
    });

    if (!slot) {
      throw new NotFoundException(`Aucun équipement trouvé pour le slot : ${slotName}`);
    }

    slot.itemId = null;

    return this.equipmentRepo.save(slot);
  }
}
