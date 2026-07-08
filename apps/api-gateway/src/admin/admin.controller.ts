import { BadRequestException, Controller, Delete, Get, Patch, Post, Put, Param, Body, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreaturesService } from '../creatures/creatures.service';
import { ResourcesService } from '../resources/resources.service';
import { BuildingsService } from '../buildings/buildings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { UpdateGameConfigDto } from '../game-config/dto/update-game-config.dto';
import { RecalculateCharacterStatPointsDto } from '../game-config/dto/recalculate-character-stat-points.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly creaturesService: CreaturesService,
    private readonly resourcesService: ResourcesService,
    private readonly buildingsService: BuildingsService,
  ) {}

  @Get('overview')
  getOverview() { return this.adminService.getOverview(); }

  @Get('movement-metrics')
  getMovementMetrics() { return this.adminService.getMovementMetrics(); }

  @Post('movement-metrics/reset')
  resetMovementMetrics() {
    return {
      message: 'Movement metrics reset.',
      metrics: this.adminService.resetMovementMetrics(),
    };
  }

  // ── Animaux (instances vivantes) ─────────────────────────────────────────

  @Get('creatures')
  getCreatures() { return this.creaturesService.findAll(); }

  /** Passerelle temporaire vers le futur Studio SDK — lecture seule. */
  @Get('creatures/world-objects')
  getCreatureWorldObjects() { return this.adminService.getCreatureWorldObjects(); }

  // ── Créatures ─────────────────────────────────────────────────────────────

  @Get('templates')
  getTemplates() { return this.adminService.getTemplates(); }

  @Post('templates')
  async createTemplate(@Body() body: { fields: Record<string, unknown> }) {
    return this.adminService.createCreatureTemplate((body?.fields ?? {}) as any);
  }

  @Get('spawns')
  getSpawns() { return this.adminService.getSpawns(); }

  /** Passerelle temporaire vers le futur Studio SDK — lecture seule. */
  @Get('creature-spawns/world-objects')
  getCreatureSpawnWorldObjects() { return this.adminService.getCreatureSpawnWorldObjects(); }

  @Patch('templates/:key')
  async updateTemplate(@Param('key') key: string, @Body() fields: Record<string, unknown>) {
    const updated = await this.adminService.updateTemplate(key, fields);
    if (!updated) throw new NotFoundException(`Template "${key}" introuvable.`);
    this.creaturesService.refreshTemplateInMemory(key, fields);
    return updated;
  }

  // ── Assets ───────────────────────────────────────────────────────────────

  @Get('assets/tree')
  getAssetTree() { return this.adminService.getAssetTree(); }

  // ── Joueurs ───────────────────────────────────────────────────────────────

  @Get('characters')
  getCharacters() { return this.adminService.getCharacters(); }

  @Get('characters/:id/details')
  async getCharacterDetails(@Param('id') id: string) {
    const details = await this.adminService.getCharacterDetails(id);
    if (!details) throw new NotFoundException(`Personnage "${id}" introuvable.`);
    return details;
  }

  @Patch('characters/:id')
  async updateCharacter(@Param('id') id: string, @Body() fields: Record<string, number>) {
    const updated = await this.adminService.updateCharacter(id, fields);
    if (!updated) throw new NotFoundException(`Personnage "${id}" introuvable.`);
    return updated;
  }

  // ── Règles globales de progression (GameConfig — ADR-0018, Étape 1A) ────────

  @Get('game-config')
  getGameConfig() { return this.adminService.getGameConfig(); }

  @Post('game-config/preview')
  previewGameConfig(
    @Body() dto: UpdateGameConfigDto,
    @Query('targetLevel') targetLevel?: string,
  ) {
    const parsed = targetLevel != null ? Number(targetLevel) : undefined;
    return this.adminService.previewGameConfig(
      dto,
      parsed != null && Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Patch('game-config')
  updateGameConfig(@Body() dto: UpdateGameConfigDto) {
    return this.adminService.updateGameConfig(dto);
  }

  /**
   * Action destructive : remet à 0 les stats primaires distribuées de tous
   * les personnages et recalcule `unspentStatPoints` depuis GameConfig +
   * niveau courant. Exige `{ confirm: true }` (ADR-0018 §1, Étape 1B).
   */
  @Post('game-config/recalculate-character-stat-points')
  recalculateCharacterStatPoints(@Body() dto: RecalculateCharacterStatPointsDto) {
    return this.adminService.recalculateCharacterStatPoints(dto);
  }

  // ── Ressources ────────────────────────────────────────────────────────────

  @Get('resource-templates')
  getResourceTemplates() { return this.adminService.getResourceTemplates(); }

  @Post('resource-templates')
  async createResourceTemplate(@Body() body: { fields: Record<string, unknown> }) {
    return this.adminService.createResourceTemplate((body?.fields ?? {}) as any);
  }

  @Patch('resource-templates/:type')
  async updateResourceTemplate(@Param('type') type: string, @Body() fields: Record<string, unknown>) {
    const updated = await this.adminService.updateResourceTemplate(type, fields);
    if (!updated) throw new NotFoundException(`Template ressource "${type}" introuvable.`);
    return updated;
  }

  @Get('resources')
  getResources() { return this.adminService.getResources(); }

  /** Passerelle temporaire vers le futur Studio SDK — lecture seule. */
  @Get('resources/world-objects')
  getResourceWorldObjects() { return this.adminService.getResourceWorldObjects(); }

  @Patch('resources/:id')
  async updateResource(@Param('id') id: string, @Body() fields: Record<string, number>) {
    const updated = await this.adminService.updateResource(id, fields);
    if (!updated) throw new NotFoundException(`Ressource "${id}" introuvable.`);
    return updated;
  }

  @Post('resources/:id/force-respawn')
  async forceRespawnResource(@Param('id') id: string) {
    const updated = await this.resourcesService.forceRespawn(id);
    if (!updated) throw new NotFoundException(`Ressource "${id}" introuvable.`);
    return updated;
  }

  @Post('resources/:id/reset-from-template')
  async resetResourceFromTemplate(@Param('id') id: string) {
    const updated = await this.resourcesService.resetInstanceFromTemplate(id);
    if (!updated) throw new NotFoundException(`Ressource "${id}" introuvable.`);
    return updated;
  }

  // ── Skills ────────────────────────────────────────────────────────────────

  @Get('skill-definitions')
  getSkillDefinitions() { return this.adminService.getSkillDefinitions(); }

  @Get('skill-definitions/world-objects')
  getSkillDefinitionWorldObjects() { return this.adminService.getSkillDefinitionWorldObjects(); }

  // ── Items ─────────────────────────────────────────────────────────────────

  @Get('items')
  getItems() { return this.adminService.getItems(); }

  // ── CraftingRecipes ───────────────────────────────────────────────────────

  @Get('crafting-recipes')
  listCraftingRecipes() { return this.adminService.listCraftingRecipes(); }

  @Get('crafting-recipes/world-objects')
  getCraftingRecipeWorldObjects() { return this.adminService.getCraftingRecipeWorldObjects(); }

  @Get('crafting-recipes/:id')
  async getCraftingRecipe(@Param('id') id: string) {
    const recipe = await this.adminService.getCraftingRecipe(id);
    if (!recipe) throw new NotFoundException(`Recette "${id}" introuvable.`);
    return recipe;
  }

  @Patch('crafting-recipes/:id')
  async updateCraftingRecipe(@Param('id') id: string, @Body() fields: Record<string, unknown>) {
    const updated = await this.adminService.updateCraftingRecipe(id, fields as any);
    if (!updated) throw new NotFoundException(`Recette "${id}" introuvable.`);
    return updated;
  }

  @Put('crafting-recipes/:id/ingredients')
  async replaceCraftingIngredients(@Param('id') id: string, @Body() body: { ingredients?: unknown }) {
    const updated = await this.adminService.replaceCraftingIngredients(id, body?.ingredients);
    if (!updated) throw new NotFoundException(`Recette "${id}" introuvable.`);
    return updated;
  }

  @Put('crafting-recipes/:id/results')
  async replaceCraftingResults(@Param('id') id: string, @Body() body: { results?: unknown }) {
    const updated = await this.adminService.replaceCraftingResults(id, body?.results);
    if (!updated) throw new NotFoundException(`Recette "${id}" introuvable.`);
    return updated;
  }

  @Get('crafting-recipes/:id/validate')
  validateCraftingRecipe(@Param('id') id: string) { return this.adminService.validateCraftingRecipe(id); }

  // ── CraftingStations ─────────────────────────────────────────────────────

  @Get('crafting-station-templates')
  listCraftingStationTemplates() { return this.adminService.listCraftingStationTemplates(); }

  @Get('crafting-station-templates/world-objects')
  getCraftingStationTemplateWorldObjects() { return this.adminService.getCraftingStationTemplateWorldObjects(); }

  @Get('crafting-stations')
  listCraftingStations() { return this.adminService.listCraftingStations(); }

  @Get('crafting-stations/world-objects')
  getCraftingStationWorldObjects() { return this.adminService.getCraftingStationWorldObjects(); }

  // ── Buildings ─────────────────────────────────────────────────────────────

  @Get('building-templates')
  listBuildingTemplates() { return this.buildingsService.listTemplates(); }

  @Get('building-templates/world-objects')
  getBuildingTemplateWorldObjects() { return this.buildingsService.getTemplateWorldObjects(); }

  @Post('building-templates')
  createBuildingTemplate(@Body() body: Record<string, unknown>) {
    return this.buildingsService.createTemplate(body as any);
  }

  @Patch('building-templates/:id')
  updateBuildingTemplate(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.buildingsService.updateTemplate(id, body as any);
  }

  @Get('buildings')
  listBuildings(@Query('mapId') mapId?: string) {
    return this.buildingsService.listBuildings(mapId != null ? Number(mapId) : undefined);
  }

  @Get('buildings/world-objects')
  getBuildingWorldObjects(@Query('mapId') mapId?: string) {
    return this.buildingsService.getBuildingWorldObjects(mapId != null ? Number(mapId) : undefined);
  }

  @Post('buildings')
  createBuilding(@Body() body: { templateId: string; worldX: number; worldY: number; mapId?: number }) {
    return this.buildingsService.createBuilding(body.templateId, body.worldX, body.worldY, body.mapId);
  }

  @Patch('buildings/:id')
  updateBuilding(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.buildingsService.updateBuilding(id, body as any);
  }

  @Delete('buildings/:id')
  deleteBuilding(@Param('id') id: string) {
    return this.buildingsService.deleteBuilding(id);
  }
}
