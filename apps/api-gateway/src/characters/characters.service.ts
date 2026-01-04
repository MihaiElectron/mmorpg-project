/**
 * CharactersService
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Gère toute la logique métier liée aux personnages.
 * - Création, lecture, mise à jour, suppression.
 * - Vérifie les règles métier (unicité du nom, un seul personnage par joueur, etc.).
 * - Interagit avec la base via TypeORM.
 *
 * Emplacement :
 * mmorpg-project/apps/api-gateway/src/characters/characters.service.ts
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
import { UpdateCharacterDto } from './dto/update-character.dto';
import { EquipItemDto } from './dto/equip-item.dto';

@Injectable()
export class CharactersService {
  constructor(
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
  ) {}

  /**
   * create()
   * -----------------------------------------------------------------------------
   * Crée un personnage pour un joueur.
   * Règles métier :
   * - Un joueur ne peut avoir qu'un seul personnage.
   * - Le nom du personnage doit être unique.
   */
  async create(dto: CreateCharacterDto): Promise<Character> {
    // Vérifie si le joueur a déjà un personnage
    const existingForUser = await this.characterRepository.findOne({
      where: { userId: dto.userId },
    });

    if (existingForUser) {
      throw new ConflictException(
        'Ce joueur possède déjà un personnage.',
      );
    }

    // Vérifie si le nom est déjà pris
    const existingName = await this.characterRepository.findOne({
      where: { name: dto.name },
    });

    if (existingName) {
      throw new ConflictException(
        'Ce nom de personnage est déjà utilisé.',
      );
    }

    // Création du personnage
    const character = this.characterRepository.create(dto);
    return this.characterRepository.save(character);
  }

  /**
   * findAll()
   * -----------------------------------------------------------------------------
   * Retourne tous les personnages.
   */
  async findAll(): Promise<Character[]> {
    return this.characterRepository.find({
      relations: ['equipment'],
    });
  }

  /**
   * findOne()
   * -----------------------------------------------------------------------------
   * Retourne un personnage par son ID.
   */
  async findOne(id: number): Promise<Character> {
    const character = await this.characterRepository.findOne({
      where: { id },
      relations: ['equipment'],
    });

    if (!character) {
      throw new NotFoundException('Personnage introuvable.');
    }

    return character;
  }

  /**
   * update()
   * -----------------------------------------------------------------------------
   * Met à jour un personnage.
   */
  async update(id: number, dto: UpdateCharacterDto): Promise<Character> {
    const character = await this.findOne(id);

    Object.assign(character, dto);

    return this.characterRepository.save(character);
  }

  /**
   * remove()
   * -----------------------------------------------------------------------------
   * Supprime un personnage.
   */
  async remove(id: number): Promise<void> {
    const character = await this.findOne(id);
    await this.characterRepository.remove(character);
  }

  /**
   * equipItem()
   * -----------------------------------------------------------------------------
   * Équipe un item dans un slot.
   * (La logique dépend de ton CharacterEquipment)
   */
  async equipItem(id: number, dto: EquipItemDto) {
    const character = await this.findOne(id);

    // TODO : logique d'équipement selon ton système
    // Exemple :
    // character.equipment[dto.slot] = dto.itemId;

    return this.characterRepository.save(character);
  }
}
