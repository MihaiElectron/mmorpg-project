import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { CreatureTemplate } from '../animals/entities/creature-template.entity';
import { CreatureSpawn } from '../animals/entities/creature-spawn.entity';
import { Animal } from '../animals/entities/animal.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(CreatureTemplate)
    private readonly templateRepo: Repository<CreatureTemplate>,
    @InjectRepository(CreatureSpawn)
    private readonly spawnRepo: Repository<CreatureSpawn>,
    @InjectRepository(Animal)
    private readonly animalRepo: Repository<Animal>,
  ) {}

  getTemplates(): Promise<CreatureTemplate[]> {
    return this.templateRepo.find({ order: { name: 'ASC' } });
  }

  getSpawns(): Promise<CreatureSpawn[]> {
    return this.spawnRepo.find({ relations: ['template'], order: { key: 'ASC' } });
  }

  async getOverview(): Promise<{
    templates: number;
    spawns: number;
    activeAnimals: number;
  }> {
    const [templates, spawns, activeAnimals] = await Promise.all([
      this.templateRepo.count(),
      this.spawnRepo.count(),
      this.animalRepo.count({ where: { state: Not('dead') } }),
    ]);
    return { templates, spawns, activeAnimals };
  }
}
