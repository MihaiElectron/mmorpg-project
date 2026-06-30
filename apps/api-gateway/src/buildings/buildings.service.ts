import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BuildingTemplate } from './entities/building-template.entity';
import { Building } from './entities/building.entity';
import { BuildingType, BUILDING_TYPE_VALUES } from './enums/building-type.enum';
import { BuildingState, BUILDING_STATE_VALUES } from './enums/building-state.enum';
import {
  toBuildingTemplateWorldObject,
  toBuildingWorldObject,
  BuildingTemplateWorldObject,
  BuildingWorldObject,
} from './adapters/building-world-object.adapter';
import { DEFAULT_MAP_ID } from '../common/world-coordinates';

const DEFAULT_TEMPLATES: Pick<
  BuildingTemplate,
  'key' | 'name' | 'buildingType' | 'interactionRadiusWU' | 'enabled'
>[] = [
  { key: 'auction_house',    name: 'Hôtel des Ventes',  buildingType: BuildingType.AUCTION_HOUSE,    interactionRadiusWU: 2048, enabled: true },
  { key: 'mailbox',          name: 'Boîte aux lettres', buildingType: BuildingType.MAILBOX,          interactionRadiusWU: 1536, enabled: true },
  { key: 'bank',             name: 'Banque',            buildingType: BuildingType.BANK,             interactionRadiusWU: 2048, enabled: true },
  { key: 'guild_hall',       name: 'Salle de Guilde',   buildingType: BuildingType.GUILD_HALL,       interactionRadiusWU: 2048, enabled: true },
  { key: 'shrine',           name: 'Sanctuaire',        buildingType: BuildingType.SHRINE,           interactionRadiusWU: 1536, enabled: true },
  { key: 'teleport',         name: 'Portail',           buildingType: BuildingType.TELEPORT,         interactionRadiusWU: 1536, enabled: true },
  { key: 'dungeon_entrance', name: 'Entrée de Donjon',  buildingType: BuildingType.DUNGEON_ENTRANCE, interactionRadiusWU: 2048, enabled: true },
];

@Injectable()
export class BuildingsService implements OnModuleInit {
  private readonly logger = new Logger(BuildingsService.name);

  constructor(
    @InjectRepository(BuildingTemplate)
    private readonly templateRepo: Repository<BuildingTemplate>,
    @InjectRepository(Building)
    private readonly buildingRepo: Repository<Building>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultTemplates();
  }

  async seedDefaultTemplates(): Promise<void> {
    for (const def of DEFAULT_TEMPLATES) {
      const existing = await this.templateRepo.findOne({ where: { key: def.key } });
      if (existing) continue;
      await this.templateRepo.save(
        this.templateRepo.create({ ...def, textureKey: null }),
      );
      this.logger.log(`BuildingTemplate seeded: ${def.key}`);
    }
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  listTemplates(): Promise<BuildingTemplate[]> {
    return this.templateRepo.find({ order: { key: 'ASC' } });
  }

  async getTemplateWorldObjects(): Promise<BuildingTemplateWorldObject[]> {
    const templates = await this.listTemplates();
    return templates.map(toBuildingTemplateWorldObject);
  }

  async createTemplate(fields: {
    key: string;
    name: string;
    buildingType: BuildingType;
    textureKey?: string | null;
    interactionRadiusWU?: number;
    enabled?: boolean;
  }): Promise<BuildingTemplate> {
    this.validateKey(fields.key);
    this.validateBuildingType(fields.buildingType);

    const existing = await this.templateRepo.findOne({ where: { key: fields.key } });
    if (existing) throw new BadRequestException(`Template "${fields.key}" existe déjà.`);

    const template = this.templateRepo.create({
      key: fields.key,
      name: fields.name.trim(),
      buildingType: fields.buildingType,
      textureKey: fields.textureKey ?? null,
      interactionRadiusWU: fields.interactionRadiusWU ?? 1536,
      enabled: fields.enabled ?? true,
    });
    return this.templateRepo.save(template);
  }

  async updateTemplate(
    id: string,
    fields: Partial<Pick<BuildingTemplate, 'name' | 'textureKey' | 'interactionRadiusWU' | 'enabled'>>,
  ): Promise<BuildingTemplate> {
    const template = await this.templateRepo.findOne({ where: { id } });
    if (!template) throw new NotFoundException(`Template "${id}" introuvable.`);
    Object.assign(template, fields);
    return this.templateRepo.save(template);
  }

  // ── Buildings (instances) ─────────────────────────────────────────────────

  listBuildings(mapId?: number): Promise<Building[]> {
    const where = mapId != null ? { mapId } : undefined;
    return this.buildingRepo.find({ where, order: { mapId: 'ASC', worldX: 'ASC', worldY: 'ASC' } });
  }

  async getBuildingWorldObjects(mapId?: number): Promise<BuildingWorldObject[]> {
    const buildings = await this.listBuildings(mapId);
    return buildings.map(toBuildingWorldObject);
  }

  async createBuilding(
    templateId: string,
    worldX: number,
    worldY: number,
    mapId: number = DEFAULT_MAP_ID,
  ): Promise<Building> {
    const template = await this.templateRepo.findOne({ where: { id: templateId } });
    if (!template) throw new NotFoundException(`Template "${templateId}" introuvable.`);

    const building = this.buildingRepo.create({
      templateId,
      mapId,
      worldX: Math.round(worldX),
      worldY: Math.round(worldY),
      state: BuildingState.ACTIVE,
    });
    const saved = await this.buildingRepo.save(building);
    return this.buildingRepo.findOneOrFail({ where: { id: saved.id } });
  }

  async updateBuilding(
    id: string,
    fields: Partial<Pick<Building, 'worldX' | 'worldY' | 'mapId' | 'state'>>,
  ): Promise<Building> {
    const building = await this.buildingRepo.findOne({ where: { id } });
    if (!building) throw new NotFoundException(`Building "${id}" introuvable.`);
    if (fields.state !== undefined) this.validateBuildingState(fields.state);
    Object.assign(building, fields);
    await this.buildingRepo.save(building);
    return this.buildingRepo.findOneOrFail({ where: { id } });
  }

  async deleteBuilding(id: string): Promise<Building> {
    const building = await this.buildingRepo.findOne({ where: { id } });
    if (!building) throw new NotFoundException(`Building "${id}" introuvable.`);
    await this.buildingRepo.remove(building);
    return building;
  }

  async findBuildingById(id: string): Promise<Building | null> {
    return this.buildingRepo.findOne({ where: { id } });
  }

  // ── Validation helpers ────────────────────────────────────────────────────

  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') throw new BadRequestException('key est requis.');
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      throw new BadRequestException(`key "${key}" doit être snake_case (a-z, 0-9, _).`);
    }
  }

  private validateBuildingType(value: string): void {
    if (!BUILDING_TYPE_VALUES.includes(value as BuildingType)) {
      throw new BadRequestException(
        `buildingType "${value}" invalide. Valeurs : ${BUILDING_TYPE_VALUES.join(', ')}.`,
      );
    }
  }

  private validateBuildingState(value: string): void {
    if (!BUILDING_STATE_VALUES.includes(value as BuildingState)) {
      throw new BadRequestException(
        `state "${value}" invalide. Valeurs : ${BUILDING_STATE_VALUES.join(', ')}.`,
      );
    }
  }
}
