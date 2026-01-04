/**
 * CharactersService (sécurisé)
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Gère la logique métier liée aux personnages, en respectant la sécurité MMO.
 * - Toutes les opérations sensibles sont liées à un userId (joueur authentifié).
 * - Garantit qu'un joueur ne peut agir QUE sur ses propres personnages.
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
   * Crée un personnage pour un joueur donné.
   *
   * Règles métier :
   * - Un joueur ne peut avoir qu'un seul personnage.
   * - Le nom du personnage doit être unique.
   *
   * Sécurité :
   * - Le userId vient du JWT (controller) et NON du client.
   */
  async create(dto: CreateCharacterDto, userId: number): Promise<Character> {
    // Vérifie si le joueur a déjà un personnage
    const existingForUser = await this.characterRepository.findOne({
      where: { userId },
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
    const character = this.characterRepository.create({
      ...dto,
      userId, // toujours injecté côté backend
    });

    return this.characterRepository.save(character);
  }

  /**
   * findByUserId()
   * -----------------------------------------------------------------------------
   * Retourne tous les personnages appartenant à un joueur.
   * (Dans ton cas : généralement 0 ou 1, vu la règle métier.)
   */
  async findByUserId(userId: number): Promise<Character[]> {
    return this.characterRepository.find({
      where: { userId },
      relations: ['equipment'],
    });
  }

  /**
   * findOneForUser()
   * -----------------------------------------------------------------------------
   * Retourne un personnage par id, mais UNIQUEMENT s'il appartient au joueur.
   *
   * Sécurité :
   * - Si le personnage n'existe pas ou n'appartient pas à ce joueur,
   *   on renvoie un 404 générique (ne révèle pas l'existence chez un autre).
   */
  async findOneForUser(id: number, userId: number): Promise<Character> {
    const character = await this.characterRepository.findOne({
      where: { id, userId },
      relations: ['equipment'],
    });

    if (!character) {
      throw new NotFoundException('Personnage introuvable.');
    }

    return character;
  }

  /**
   * updateForUser()
   * -----------------------------------------------------------------------------
   * Met à jour un personnage appartenant au joueur.
   *
   * Sécurité :
   * - Vérifie d'abord que le personnage appartient bien au userId.
   */
  async updateForUser(
    id: number,
    dto: UpdateCharacterDto,
    userId: number,
  ): Promise<Character> {
    const character = await this.findOneForUser(id, userId);

    Object.assign(character, dto);

    return this.characterRepository.save(character);
  }

  /**
   * removeForUser()
   * -----------------------------------------------------------------------------
   * Supprime un personnage appartenant au joueur.
   *
   * Sécurité :
   * - Impossible de supprimer le personnage d'un autre joueur.
   */
  async removeForUser(id: number, userId: number): Promise<void> {
    const character = await this.findOneForUser(id, userId);
    await this.characterRepository.remove(character);
  }

  /**
   * equipItemForUser()
   * -----------------------------------------------------------------------------
   * Équipe un item sur un personnage appartenant au joueur.
   *
   * Sécurité :
   * - Vérifie que le personnage appartient bien au userId.
   * - Évite qu'un joueur équipe un item sur un personnage d'un autre compte.
   *
   * TODO :
   * - Implémenter la logique d'équipement en fonction de ta structure "equipment".
   */
  async equipItemForUser(
    id: number,
    dto: EquipItemDto,
    userId: number,
  ): Promise<Character> {
    const character = await this.findOneForUser(id, userId);

    // TODO : logique d'équipement selon ton système de slots / equipment.
    // Exemple (purement illustratif) :
    //
    // if (!character.equipment) {
    //   character.equipment = {};
    // }
    // character.equipment[dto.slot] = dto.itemId;

    return this.characterRepository.save(character);
  }

  /**
   * [Optionnel] Méthodes génériques internes
   * -----------------------------------------------------------------------------
   * Si tu veux encore garder une version "non sécurisée" pour un usage interne
   * (scripts admin, outils internes), tu peux conserver findOne() en privé.
   */

  // private async findOne(id: number): Promise<Character> {
  //   const character = await this.characterRepository.findOne({
  //     where: { id },
  //     relations: ['equipment'],
  //   });
  //
  //   if (!character) {
  //     throw new NotFoundException('Personnage introuvable.');
  //   }
  //
  //   return character;
  // }
}
