import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
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
      relations: ['equipment', 'equipment.item'],
    });
  }

  /**
   * Récupère le "premier" personnage d'un utilisateur (pour /characters/me)
   */
  async findFirstByUser(userId: string): Promise<Character> {
    const character = await this.characterRepository.findOne({
      where: { userId },
      relations: ['equipment', 'equipment.item'],
      order: { createdAt: 'ASC' },
    });

    if (!character) {
      throw new NotFoundException(`No character found for user ${userId}`);
    }

    return character;
  }

  /**
   * Récupère un personnage par son ID (vérifie que l'utilisateur en est propriétaire)
   */
  async findOne(id: string, userId: string): Promise<Character> {
    const character = await this.characterRepository.findOne({
      where: { id, userId },
      relations: ['equipment', 'equipment.item'],
    });

    if (!character) {
      throw new NotFoundException(`Character ${id} not found`);
    }

    return character;
  }

  /**
   * Équipe un item sur un personnage
   * - Vérifie que le personnage appartient à l'utilisateur
   * - Vérifie que l'item existe
   * - Vérifie que le slot de l'item correspond au slot demandé
   * - Remplace l'item existant dans ce slot s'il y en a un
   * - Pour les earrings : choisit LEFT si libre, sinon RIGHT, sinon remplace LEFT
   */
  async equipItem(
    characterId: string,
    userId: string,
    dto: EquipItemDto,
  ): Promise<Character> {
    // Vérifier que le personnage appartient à l'utilisateur
    const character = await this.findOne(characterId, userId);

    // Vérifier que l'item existe
    const item = await this.itemRepository.findOne({
      where: { id: dto.itemId },
    });

    if (!item) {
      throw new NotFoundException(`Item ${dto.itemId} not found`);
    }

    // Déterminer le slot final à utiliser
    let finalSlot: EquipmentSlot;

    if (dto.slot) {
      // Si le slot est fourni par le frontend, on le respecte
      finalSlot = dto.slot;
      if (item.slot && item.slot !== finalSlot) {
        throw new BadRequestException(
          `Item slot (${item.slot}) does not match requested slot (${finalSlot})`,
        );
      }
    } else {
      // Si slot non fourni et item est earring, choisir automatiquement
      if (
        item.slot === EquipmentSlot.LEFT_EARRING ||
        item.slot === EquipmentSlot.RIGHT_EARRING
      ) {
        const left = await this.equipmentRepository.findOne({
          where: { characterId, slot: EquipmentSlot.LEFT_EARRING },
        });

        if (!left) {
          finalSlot = EquipmentSlot.LEFT_EARRING;
        } else {
          const right = await this.equipmentRepository.findOne({
            where: { characterId, slot: EquipmentSlot.RIGHT_EARRING },
          });

          if (!right) {
            finalSlot = EquipmentSlot.RIGHT_EARRING;
          } else {
            // Les deux slots sont occupés → remplacer le LEFT_EARRING
            finalSlot = EquipmentSlot.LEFT_EARRING;
          }
        }
      } else {
        // Pour les autres items, on prend le slot de l'item si défini
        if (!item.slot) {
          throw new BadRequestException('Slot is required for this item');
        }
        finalSlot = item.slot;
      }
    }

    // Tout ce qui touche à la DB doit être dans la transaction
    return await this.dataSource.transaction(async (manager) => {
      // Supprimer l'équipement existant dans ce slot s'il y en a un
      await manager.delete(CharacterEquipment, {
        characterId,
        slot: finalSlot,
      });

      // Créer le nouvel équipement
      const equipment = manager.create(CharacterEquipment, {
        characterId,
        itemId: item.id,
        slot: finalSlot,
      });

      await manager.save(CharacterEquipment, equipment);

      // Recalculer les stats du personnage
      await this.recalculateStats(characterId, manager);

      // Retourner le personnage mis à jour
      const updatedCharacter = await manager.findOne(Character, {
        where: { id: characterId },
        relations: ['equipment', 'equipment.item'],
      });

      if (!updatedCharacter) {
        throw new NotFoundException(`Character ${characterId} not found`);
      }

      return updatedCharacter;
    });
  }

  /**
   * Déséquipe un item d'un personnage
   */
  async unequipItem(
    characterId: string,
    userId: string,
    dto: UnequipItemDto,
  ): Promise<Character> {
    // Vérifier que le personnage appartient à l'utilisateur
    const character = await this.findOne(characterId, userId);

    return await this.dataSource.transaction(async (manager) => {
      // Supprimer l'équipement dans ce slot
      const result = await manager.delete(CharacterEquipment, {
        characterId,
        slot: dto.slot,
      });

      if (result.affected === 0) {
        throw new NotFoundException(
          `No equipment found in slot ${dto.slot} for character ${characterId}`,
        );
      }

      // Recalculer les stats du personnage
      await this.recalculateStats(characterId, manager);

      // Retourner le personnage mis à jour
      const updatedCharacter = await manager.findOne(Character, {
        where: { id: characterId },
        relations: ['equipment', 'equipment.item'],
      });

      if (!updatedCharacter) {
        throw new NotFoundException(`Character ${characterId} not found`);
      }

      return updatedCharacter;
    });
  }

  /**
   * Recalcule les stats du personnage en fonction de son équipement
   * Note: Les stats totales sont calculées à la volée lors de la récupération
   * du personnage, cette méthode peut être étendue pour stocker les stats calculées
   */
  private async recalculateStats(
    characterId: string,
    manager: EntityManager,
  ): Promise<void> {
    const character = await manager.findOne(Character, {
      where: { id: characterId },
      relations: ['equipment', 'equipment.item'],
    });

    if (!character) {
      return;
    }

    // Les stats sont calculées à la volée lors de la récupération
    // Cette méthode peut être étendue pour stocker des stats calculées si nécessaire
  }

  /**
   * Supprime un personnage
   */
  async remove(id: string, userId: string): Promise<void> {
    const character = await this.findOne(id, userId);
    await this.characterRepository.remove(character);
  }
}
