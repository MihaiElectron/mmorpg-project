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

@Injectable()
export class CharactersService {
  /**
   * Constructeur du service
   * ----------------------------------------------------------------------------
   * Injection des repositories nécessaires :
   *
   * - repo :
   *     Repository principal pour gérer les entités Character.
   *     Utilisé pour :
   *       • créer un personnage
   *       • vérifier l’unicité du nom
   *       • vérifier qu’un joueur n’a qu’un seul personnage
   *       • récupérer un personnage
   *       • supprimer un personnage
   *
   * - equipmentRepo :
   *     Repository pour gérer les entrées de la table character_equipment.
   *     Ajouté à l’Étape 2.
   *     Utilisé plus tard pour :
   *       • créer un slot d’équipement
   *       • mettre à jour un slot existant
   *       • charger l’équipement d’un personnage
   * ----------------------------------------------------------------------------
   */
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
   *
   * Règles :
   * - Un joueur ne peut posséder qu’un seul personnage.
   * - Le nom du personnage doit être unique.
   *
   * Paramètres :
   * - dto    : données envoyées par le frontend (name, sex)
   * - userId : identifiant du joueur
   *
   * Retour :
   * - Le personnage nouvellement créé.
   * ----------------------------------------------------------------------------
   */
  async create(dto: CreateCharacterDto, userId: number): Promise<Character> {
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
   *
   * Notes :
   * - Charge également la relation "equipment" (Étape 3).
   * - Retourne null si aucun personnage n’existe pour ce joueur.
   *
   * Paramètres :
   * - userId : identifiant du joueur
   *
   * Retour :
   * - Le personnage complet (avec équipement), ou null.
   * ----------------------------------------------------------------------------
   */
  async findOneByUserId(userId: number): Promise<Character | null> {
    return this.repo.findOne({
      where: { userId },
      relations: ['equipment'], // Étape 3 : chargement des slots d’équipement
    });
  }

  /**
   * removeForUser()
   * ----------------------------------------------------------------------------
   * Supprime le personnage d’un joueur.
   *
   * Règles :
   * - Le personnage doit appartenir au joueur.
   * - Si aucun personnage ne correspond, une erreur 404 est renvoyée.
   *
   * Paramètres :
   * - id     : identifiant du personnage
   * - userId : identifiant du joueur
   *
   * Retour :
   * - void (le personnage est supprimé)
   * ----------------------------------------------------------------------------
   */
  async removeForUser(id: number, userId: number): Promise<void> {
    const character = await this.repo.findOne({ where: { id, userId } });
    if (!character) throw new NotFoundException('Personnage introuvable.');
    await this.repo.remove(character);
  }
  /**
   * equipItemForUser()
   * ----------------------------------------------------------------------------
   * Équipe un item dans un slot donné pour le personnage du joueur.
   *
   * MVP :
   * - Vérifie que le joueur possède un personnage.
   * - Cherche le slot existant ou le crée s’il n’existe pas.
   * - Met à jour l’itemId dans ce slot.
   *
   * Ce que cette version NE FAIT PAS encore :
   * - Vérifier que l’item existe réellement.
   * - Vérifier que l’item appartient au joueur.
   * - Vérifier la compatibilité item/slot.
   * - Gérer le déséquipement.
   *
   * Ces règles seront ajoutées dans les étapes suivantes.
   *
   * Paramètres :
   * - userId : identifiant du joueur
   * - dto    : { slot, itemId }
   *
   * Retour :
   * - Le slot mis à jour ou créé.
   * ----------------------------------------------------------------------------
   */
  async equipItemForUser(userId: number, dto: EquipItemDto): Promise<CharacterEquipment> {
    // Vérifier que le joueur possède un personnage
    const character = await this.findOneByUserId(userId);
    if (!character) {
      throw new NotFoundException('Aucun personnage trouvé pour ce joueur.');
    }

    // Chercher si un slot existe déjà pour ce personnage
    let slot = await this.equipmentRepo.findOne({
      where: {
        character: { id: character.id },
        slot: dto.slot,
      },
      relations: ['character'],
    });

    // Si le slot n’existe pas, on le crée
    if (!slot) {
      slot = this.equipmentRepo.create({
        character,
        slot: dto.slot,
        itemId: dto.itemId,
      });
    } else {
      // Sinon on met simplement à jour l’item
      slot.itemId = dto.itemId;
    }

    return this.equipmentRepo.save(slot);
  }


}
