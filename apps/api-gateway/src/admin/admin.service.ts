import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { CreatureTemplate } from '../animals/entities/creature-template.entity';
import { CreatureSpawn } from '../animals/entities/creature-spawn.entity';
import { Animal } from '../animals/entities/animal.entity';
import { Character } from '../characters/entities/character.entity';
import { Resource } from '../resources/entities/resource.entity';
import { ResourceTemplate } from '../resources/entities/resource-template.entity';

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
    @InjectRepository(ResourceTemplate)
    private readonly resourceTemplateRepo: Repository<ResourceTemplate>,
  ) {}

  // ── Créatures ─────────────────────────────────────────────────────────────

  async getTemplates(): Promise<(CreatureTemplate & { spawnX?: number; spawnY?: number })[]> {
    const templates = await this.templateRepo.find({ order: { name: 'ASC' } });
    const spawns    = await this.spawnRepo.find({ relations: ['template'] });

    return templates.map((t) => {
      const spawn = spawns.find((s) => s.template?.id === t.id);
      return Object.assign(t, { spawnX: spawn?.spawnX, spawnY: spawn?.spawnY });
    });
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

  // ── Templates de ressources ───────────────────────────────────────────────

  getResourceTemplates(): Promise<ResourceTemplate[]> {
    return this.resourceTemplateRepo.find({ order: { type: 'ASC' } });
  }

  async updateResourceTemplate(
    type: string,
    fields: Partial<Pick<ResourceTemplate, 'defaultRemainingLoots'>>,
  ): Promise<ResourceTemplate | null> {
    const tpl = await this.resourceTemplateRepo.findOne({ where: { type } });
    if (!tpl) return null;
    Object.assign(tpl, fields);
    return this.resourceTemplateRepo.save(tpl);
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
    // Un déplacement admin remet la ressource en jeu
    if ('x' in fields || 'y' in fields) {
      resource.state = 'alive';
      if (resource.remainingLoots === 0) resource.remainingLoots = 5;
    }
    return this.resourceRepo.save(resource);
  }

  async createResource(type: string, x: number, y: number): Promise<Resource> {
    const tpl = await this.resourceTemplateRepo.findOne({ where: { type } });
    const remainingLoots = tpl?.defaultRemainingLoots ?? 9999;
    return this.resourceRepo.save(
      this.resourceRepo.create({ type, x: Math.round(x), y: Math.round(y), remainingLoots }),
    );
  }

  async deleteResource(id: string): Promise<Resource | null> {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) return null;
    resource.state = 'dead';
    resource.remainingLoots = 0;
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
