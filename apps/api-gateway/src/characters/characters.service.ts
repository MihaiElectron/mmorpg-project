/**
 * CharactersService — Version simplifiée pour MVP
 * -----------------------------------------------------------------------------
 * Gère un seul personnage par joueur.
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

@Injectable()
export class CharactersService {
  constructor(
    @InjectRepository(Character)
    private readonly repo: Repository<Character>,
  ) {}

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

  async findOneByUserId(userId: number): Promise<Character | null> {
    return this.repo.findOne({
      where: { userId },
      relations: ['equipment'],
    });
  }

  async removeForUser(id: number, userId: number): Promise<void> {
    const character = await this.repo.findOne({ where: { id, userId } });
    if (!character) throw new NotFoundException('Personnage introuvable.');
    await this.repo.remove(character);
  }
}
