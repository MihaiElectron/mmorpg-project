import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Animal } from './entities/animal.entity';
import { Character } from '../characters/entities/character.entity';

@Injectable()
export class AnimalsService implements OnModuleInit {
  constructor(
    @InjectRepository(Animal)
    private readonly animalRepository: Repository<Animal>,
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
  ) {}

  async onModuleInit() {
    await this.seedTurkey();
  }

  findAll() {
    return this.animalRepository.find();
  }

  findOne(id: string) {
    return this.animalRepository.findOne({ where: { id } });
  }

  async attack(id: string, characterId: string) {
    const animal = await this.findOne(id);
    if (!animal || animal.state === 'dead') return animal;

    const character = await this.characterRepository.findOne({
      where: { id: characterId },
    });
    if (!character) return null;

    const attack = Math.max(character.attack, 5);
    const damage = Math.max(attack - animal.armor, 1);

    animal.health = Math.max(animal.health - damage, 0);
    animal.state = animal.health === 0 ? 'dead' : 'alive';

    const saved = await this.animalRepository.save(animal);

    return {
      ...saved,
      damage,
      attackerId: character.id,
    };
  }

  private async seedTurkey() {
    const existing = await this.animalRepository.findOne({
      where: { key: 'turkey_spawn_1' },
    });

    if (existing) {
      await this.animalRepository.update(existing.id, {
        x: 600,
        y: 580,
        health: 30,
        maxHealth: 30,
        armor: 2,
        state: 'alive',
      });
      return;
    }

    await this.animalRepository.save(
      this.animalRepository.create({
        key: 'turkey_spawn_1',
        type: 'turkey',
        name: 'Turkey',
        x: 600,
        y: 580,
        health: 30,
        maxHealth: 30,
        armor: 2,
        state: 'alive',
      }),
    );
  }
}
