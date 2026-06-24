import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, MoreThan } from 'typeorm';
import { CreatureTemplate } from '../animals/entities/creature-template.entity';
import { CreatureSpawn } from '../animals/entities/creature-spawn.entity';
import { Animal } from '../animals/entities/animal.entity';
import { Character } from '../characters/entities/character.entity';
import { Resource } from '../resources/entities/resource.entity';
import { ResourceTemplate } from '../resources/entities/resource-template.entity';
import { SkillDefinition } from '../skills/entities/skill-definition.entity';
import { PlayerSkill } from '../skills/entities/player-skill.entity';
import { toSkillDefinitionWorldObject, SkillDefinitionWorldObject } from '../skills/adapters/skill-definition-world-object.adapter';
import { WorldService } from '../world/world.service';
import { DEFAULT_MAP_ID, isoScreenToWorldWU } from '../common/world-coordinates';
import { toResourceWorldObject, ResourceWorldObject } from '../resources/adapters/resource-world-object.adapter';
import { toAnimalWorldObject, AnimalWorldObject } from '../animals/adapters/animal-world-object.adapter';
import { toCreatureSpawnWorldObject, CreatureSpawnWorldObject } from '../animals/adapters/creature-spawn-world-object.adapter';

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
    @InjectRepository(SkillDefinition)
    private readonly skillDefinitionRepo: Repository<SkillDefinition>,
    @InjectRepository(PlayerSkill)
    private readonly playerSkillRepo: Repository<PlayerSkill>,
    private readonly worldService: WorldService,
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
    fields: Partial<Pick<CreatureTemplate, 'baseHealth' | 'aggroRadius' | 'baseAttack' | 'baseArmor' | 'fleeThresholdPct' | 'patrolRadius' | 'respawnDelayMs'>>,
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
    fields: Partial<Pick<ResourceTemplate, 'defaultRemainingLoots' | 'respawnDelayMs' | 'gatheringXpReward'>> & { skillKey?: string | null },
  ): Promise<ResourceTemplate | null> {
    if (fields.respawnDelayMs !== undefined) {
      const v = fields.respawnDelayMs;
      if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0 || v > 86_400_000) {
        throw new BadRequestException(
          'respawnDelayMs doit être un entier > 0 et <= 86 400 000 ms (24h).',
        );
      }
    }
    if (fields.defaultRemainingLoots !== undefined) {
      const v = fields.defaultRemainingLoots;
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1 || v > 999_999) {
        throw new BadRequestException(
          'defaultRemainingLoots doit être un entier >= 1 et <= 999 999.',
        );
      }
    }
    if (fields.gatheringXpReward !== undefined) {
      const v = fields.gatheringXpReward;
      if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 999_999) {
        throw new BadRequestException(
          'gatheringXpReward doit être un entier >= 0 et <= 999 999.',
        );
      }
    }
    if ('skillKey' in fields) {
      const v = fields.skillKey;
      if (v !== null) {
        if (typeof v !== 'string' || v.trim() === '') {
          throw new BadRequestException('skillKey doit être une chaîne non vide ou null.');
        }
        const exists = await this.skillDefinitionRepo.findOne({ where: { key: v } });
        if (!exists) {
          throw new BadRequestException(`Skill "${v}" inexistant dans SkillDefinition.`);
        }
      }
    }
    const tpl = await this.resourceTemplateRepo.findOne({ where: { type } });
    if (!tpl) return null;
    Object.assign(tpl, fields);
    return this.resourceTemplateRepo.save(tpl);
  }

  // ── Ressources ────────────────────────────────────────────────────────────

  getResources(): Promise<Resource[]> {
    return this.resourceRepo.find({ order: { type: 'ASC' } });
  }

  /** Passerelle temporaire vers le futur Studio SDK — lecture seule. */
  async getResourceWorldObjects(): Promise<ResourceWorldObject[]> {
    const [resources, templates] = await Promise.all([
      this.resourceRepo.find({ order: { type: 'ASC' } }),
      this.resourceTemplateRepo.find(),
    ]);
    const templateByType = new Map(templates.map((t) => [t.type, t]));
    return resources.map((r) => toResourceWorldObject(r, templateByType.get(r.type) ?? null));
  }

  /** Passerelle temporaire vers le futur Studio SDK — lecture seule. */
  async getCreatureSpawnWorldObjects(): Promise<CreatureSpawnWorldObject[]> {
    const spawns = await this.spawnRepo.find({
      relations: ['template'],
      order: { key: 'ASC' },
    });
    return spawns.map(toCreatureSpawnWorldObject);
  }

  /** Passerelle temporaire vers le futur Studio SDK — lecture seule. */
  async getAnimalWorldObjects(): Promise<AnimalWorldObject[]> {
    const animals = await this.animalRepo.find({
      relations: ['spawn', 'spawn.template'],
      order: { state: 'ASC' },
    });
    return animals.map(toAnimalWorldObject);
  }

  async updateResource(
    id: string,
    fields: Partial<Pick<Resource, 'x' | 'y' | 'remainingLoots' | 'state' | 'respawnDelayMs'>>,
  ): Promise<Resource | null> {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) return null;
    Object.assign(resource, fields);
    // Un déplacement sans changement d'état explicite remet la ressource en jeu
    if (('x' in fields || 'y' in fields) && !('state' in fields)) {
      resource.state = 'alive';
      if (resource.remainingLoots === 0) resource.remainingLoots = 5;
    }
    if ('x' in fields || 'y' in fields) {
      if (!Number.isFinite(resource.x) || !Number.isFinite(resource.y)) {
        throw new BadRequestException('Coordonnées ressource invalides : x et y doivent être finis.');
      }
      let wu: ReturnType<typeof isoScreenToWorldWU>;
      try {
        wu = isoScreenToWorldWU(resource.x, resource.y);
      } catch {
        throw new BadRequestException('Conversion WU impossible pour les coordonnées ressource.');
      }
      resource.worldX = wu.worldX;
      resource.worldY = wu.worldY;
      resource.mapId = DEFAULT_MAP_ID;
    }
    return this.resourceRepo.save(resource);
  }

  async createResource(type: string, x: number, y: number): Promise<Resource> {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (!Number.isFinite(rx) || !Number.isFinite(ry)) {
      throw new BadRequestException('Coordonnées ressource invalides : x et y doivent être finis.');
    }
    let wu: ReturnType<typeof isoScreenToWorldWU>;
    try {
      wu = isoScreenToWorldWU(rx, ry);
    } catch {
      throw new BadRequestException('Conversion WU impossible pour les coordonnées ressource.');
    }
    const tpl = await this.resourceTemplateRepo.findOne({ where: { type } });
    const remainingLoots = tpl?.defaultRemainingLoots ?? 9999;
    return this.resourceRepo.save(
      this.resourceRepo.create({ type, x: rx, y: ry, worldX: wu.worldX, worldY: wu.worldY, mapId: DEFAULT_MAP_ID, remainingLoots }),
    );
  }

  async deleteResource(id: string): Promise<Resource | null> {
    const resource = await this.resourceRepo.findOne({ where: { id } });
    if (!resource) return null;
    await this.resourceRepo.delete(id);
    return resource;
  }

  // ── SkillDefinitions ─────────────────────────────────────────────────────

  private static readonly SNAKE_CASE_REGEX = /^[a-z][a-z0-9_]{1,63}$/;

  private static validateSnakeCase(value: string, label: string): void {
    if (!AdminService.SNAKE_CASE_REGEX.test(value)) {
      throw new BadRequestException(
        `${label} doit être en snake_case (a-z, 0-9, _), 2-64 caractères, commencer par une lettre.`,
      );
    }
  }

  private static validateMaxLevel(v: number): void {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 2 || v > 999) {
      throw new BadRequestException('maxLevel doit être un entier entre 2 et 999.');
    }
  }

  private static validateBaseXpPerLevel(v: number): void {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1 || v > 100_000) {
      throw new BadRequestException('baseXpPerLevel doit être un entier entre 1 et 100 000.');
    }
  }

  private static validateXpCurveExponent(v: number): void {
    if (!Number.isFinite(v) || v < 1.0 || v > 3.0) {
      throw new BadRequestException('xpCurveExponent doit être un nombre entre 1.0 et 3.0.');
    }
  }

  getSkillDefinitions(): Promise<SkillDefinition[]> {
    return this.skillDefinitionRepo.find({ order: { key: 'ASC' } });
  }

  async getSkillDefinitionWorldObjects(): Promise<SkillDefinitionWorldObject[]> {
    const sds = await this.getSkillDefinitions();
    return sds.map(toSkillDefinitionWorldObject);
  }

  async createSkillDefinition(
    fields: Pick<SkillDefinition, 'key' | 'name'> &
      Partial<Pick<SkillDefinition, 'category' | 'maxLevel' | 'baseXpPerLevel' | 'xpCurveExponent' | 'enabled'>>,
  ): Promise<SkillDefinition> {
    if (!fields.key || typeof fields.key !== 'string') {
      throw new BadRequestException('key est requis.');
    }
    AdminService.validateSnakeCase(fields.key, 'key');

    const existing = await this.skillDefinitionRepo.findOne({ where: { key: fields.key } });
    if (existing) {
      throw new BadRequestException(`Skill "${fields.key}" existe déjà.`);
    }

    if (!fields.name || typeof fields.name !== 'string' || fields.name.trim() === '') {
      throw new BadRequestException('name est requis et non vide.');
    }
    if (fields.name.length > 256) {
      throw new BadRequestException('name doit être <= 256 caractères.');
    }

    const toCreate: Partial<SkillDefinition> = {
      key: fields.key,
      name: fields.name.trim(),
      category: 'general',
      maxLevel: 100,
      baseXpPerLevel: 100,
      xpCurveExponent: 1.5,
      enabled: true,
    };

    if (fields.category !== undefined) {
      AdminService.validateSnakeCase(fields.category, 'category');
      toCreate.category = fields.category;
    }
    if (fields.maxLevel !== undefined) {
      AdminService.validateMaxLevel(fields.maxLevel);
      toCreate.maxLevel = fields.maxLevel;
    }
    if (fields.baseXpPerLevel !== undefined) {
      AdminService.validateBaseXpPerLevel(fields.baseXpPerLevel);
      toCreate.baseXpPerLevel = fields.baseXpPerLevel;
    }
    if (fields.xpCurveExponent !== undefined) {
      AdminService.validateXpCurveExponent(fields.xpCurveExponent);
      toCreate.xpCurveExponent = fields.xpCurveExponent;
    }
    if (fields.enabled !== undefined) {
      toCreate.enabled = Boolean(fields.enabled);
    }

    return this.skillDefinitionRepo.save(this.skillDefinitionRepo.create(toCreate));
  }

  async updateSkillDefinition(
    id: string,
    fields: Partial<Pick<SkillDefinition, 'name' | 'category' | 'maxLevel' | 'baseXpPerLevel' | 'xpCurveExponent' | 'enabled'>>,
  ): Promise<SkillDefinition | null> {
    const sd = await this.skillDefinitionRepo.findOne({ where: { id } });
    if (!sd) return null;

    if (fields.name !== undefined) {
      if (typeof fields.name !== 'string' || fields.name.trim() === '') {
        throw new BadRequestException('name ne peut pas être vide.');
      }
      if (fields.name.length > 256) {
        throw new BadRequestException('name doit être <= 256 caractères.');
      }
      sd.name = fields.name.trim();
    }
    if (fields.category !== undefined) {
      AdminService.validateSnakeCase(fields.category, 'category');
      sd.category = fields.category;
    }
    if (fields.maxLevel !== undefined) {
      AdminService.validateMaxLevel(fields.maxLevel);
      const blocked = await this.playerSkillRepo.count({
        where: { skillDefinitionId: id, level: MoreThan(fields.maxLevel) },
      });
      if (blocked > 0) {
        throw new BadRequestException(
          `Impossible de réduire maxLevel à ${fields.maxLevel} : ${blocked} joueur(s) au-dessus de ce niveau.`,
        );
      }
      sd.maxLevel = fields.maxLevel;
    }
    if (fields.baseXpPerLevel !== undefined) {
      AdminService.validateBaseXpPerLevel(fields.baseXpPerLevel);
      sd.baseXpPerLevel = fields.baseXpPerLevel;
    }
    if (fields.xpCurveExponent !== undefined) {
      AdminService.validateXpCurveExponent(fields.xpCurveExponent);
      sd.xpCurveExponent = fields.xpCurveExponent;
    }
    if (fields.enabled !== undefined) {
      sd.enabled = Boolean(fields.enabled);
    }

    return this.skillDefinitionRepo.save(sd);
  }

  // ── Vue d'ensemble ────────────────────────────────────────────────────────

  async getOverview(): Promise<{
    templates: number;
    spawns: number;
    activeAnimals: number;
    connectedPlayers: number;
    registeredCharacters: number;
  }> {
    const [templates, spawns, activeAnimals, registeredCharacters] = await Promise.all([
      this.templateRepo.count(),
      this.spawnRepo.count(),
      this.animalRepo.count({ where: { state: Not('dead') } }),
      this.characterRepo.count(),
    ]);
    const connectedPlayers = this.worldService.getConnectedCount();
    return { templates, spawns, activeAnimals, connectedPlayers, registeredCharacters };
  }
}
