import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { CreatureTemplate } from '../animals/entities/creature-template.entity';
import { CreatureSpawn } from '../animals/entities/creature-spawn.entity';
import { Animal } from '../animals/entities/animal.entity';
import { Character } from '../characters/entities/character.entity';
import { Resource } from '../resources/entities/resource.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(CreatureTemplate)
    private readonly templateRepo: Repository<CreatureTemplate>,
    @InjectRepository(CreatureSpawn)
    private readonly spawnRepo: Repository<CreatureSpawn>,
    @InjectRepository(Animal)
    private readonly animalRepo: Repository<Animal>,
    @InjectRepository(Character)
    private readonly characterRepo: Repository<Character>,
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
  ) {}

  // ── Créatures ─────────────────────────────────────────────────────────────

  getTemplates(): Promise<CreatureTemplate[]> {
    return this.templateRepo.find({ order: { name: 'ASC' } });
  }

  async updateTemplate(
    key: string,
    fields: Partial<Pick<CreatureTemplate, 'baseHealth' | 'aggroRadius' | 'baseAttack' | 'baseArmor' | 'fleeThresholdPct' | 'patrolRadius'>>,
  ): Promise<CreatureTemplate | null> {
    const template = await this.templateRepo.findOne({ where: { key } });
    if (!template) return null;
    Object.assign(template, fields);
    return this.templateRepo.save(template);
  }

  getSpawns(): Promise<CreatureSpawn[]> {
    return this.spawnRepo.find({ relations: ['template'], order: { key: 'ASC' } });
  }

  // ── Joueurs ───────────────────────────────────────────────────────────────

  getCharacters(): Promise<Character[]> {
    return this.characterRepo.find({ order: { name: 'ASC' } });
  }

  async updateCharacter(
    id: string,
    fields: Partial<Pick<Character, 'level' | 'health' | 'maxHealth' | 'attack' | 'defense'>>,
  ): Promise<Character | null> {
    const character = await this.characterRepo.findOne({ where: { id } });
    if (!character) return null;
    Object.assign(character, fields);
    return this.characterRepo.save(character);
  }

  // ── Ressources ────────────────────────────────────────────────────────────

  getResources(): Promise<Resource[]> {
    return this.resourceRepo.find({ order: { type: 'ASC' } });
  }

  async updateResource(
    id: string,
    fields: Partial<Pick<Resource, 'x' | 'y' | 'remainingLoots'>>,
  ): Promise<Resource | null> {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) return null;
    Object.assign(resource, fields);
    return this.resourceRepo.save(resource);
  }

  // ── Vue d'ensemble ────────────────────────────────────────────────────────

  async getOverview(): Promise<{ templates: number; spawns: number; activeAnimals: number }> {
    const [templates, spawns, activeAnimals] = await Promise.all([
      this.templateRepo.count(),
      this.spawnRepo.count(),
      this.animalRepo.count({ where: { state: Not('dead') } }),
    ]);
    return { templates, spawns, activeAnimals };
  }
}
