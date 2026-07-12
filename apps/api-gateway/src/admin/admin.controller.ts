import { BadRequestException, Controller, Delete, Get, Patch, Post, Put, Param, Body, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreaturesService } from '../creatures/creatures.service';
import { CreatureAbilitiesService } from '../creatures/creature-abilities.service';
import { ReplaceCreatureAbilitiesDto } from '../creatures/dto/creature-ability.dto';
import { ResourcesService } from '../resources/resources.service';
import { BuildingsService } from '../buildings/buildings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { UpdateGameConfigDto } from '../game-config/dto/update-game-config.dto';
import { RecalculateCharacterProgressionDto } from '../game-config/dto/recalculate-character-progression.dto';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';
import { UpdateDerivedStatDefinitionDto } from '../derived-stats/dto/update-derived-stat-definition.dto';
import { CreateDerivedStatDefinitionDto } from '../derived-stats/dto/create-derived-stat-definition.dto';
import { RemoveMasteryReferenceDto } from '../derived-stats/dto/remove-mastery-reference.dto';
import { PreviewDerivedStatsDto } from '../derived-stats/dto/preview-derived-stats.dto';
import { ActiveSkillsService } from '../active-skills/active-skills.service';
import { CreateSkillDefinitionDto } from '../active-skills/dto/create-skill-definition.dto';
import { UpdateSkillDefinitionDto } from '../active-skills/dto/update-skill-definition.dto';
import { MasteriesService } from '../masteries/masteries.service';
import { CreateMasteryDefinitionDto } from '../masteries/dto/create-mastery-definition.dto';
import { UpdateMasteryDefinitionDto } from '../masteries/dto/update-mastery-definition.dto';
import {
  CONTEXTUAL_MASTERY_EFFECT_STATS,
  MASTERY_EFFECT_MODES,
} from '../masteries/mastery-effect-targets';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly creaturesService: CreaturesService,
    private readonly creatureAbilitiesService: CreatureAbilitiesService,
    private readonly resourcesService: ResourcesService,
    private readonly buildingsService: BuildingsService,
    private readonly derivedStatsService: DerivedStatsService,
    private readonly activeSkillsService: ActiveSkillsService,
    private readonly masteriesService: MasteriesService,
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

  /**
   * Inspection combat runtime d'une créature vivante (Studio DevTools).
   * Lecture seule, données live (état, cible, cooldown, portée). 404 si l'id
   * n'est pas une créature vivante connue.
   */
  @Get('creatures/:id/runtime-combat')
  getCreatureRuntimeCombat(@Param('id') id: string) {
    const info = this.creaturesService.getRuntimeCombatInfo(id);
    if (!info) throw new NotFoundException(`Créature vivante "${id}" introuvable.`);
    return info;
  }

  /**
   * Capacités configurables d'un CreatureTemplate (V5-A) — association de skills
   * existants au template. Lecture + remplacement de liste. Aucun déclenchement
   * combat : config uniquement. 404 si le template n'existe pas.
   */
  @Get('templates/:key/abilities')
  getTemplateAbilities(@Param('key') key: string) {
    return this.creatureAbilitiesService.listForTemplate(key);
  }

  @Put('templates/:key/abilities')
  replaceTemplateAbilities(
    @Param('key') key: string,
    @Body() body: ReplaceCreatureAbilitiesDto,
  ) {
    return this.creatureAbilitiesService.replaceForTemplate(key, body.abilities);
  }

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

  /** Une seule ligne (même forme qu'un élément de la liste) — refresh ciblé DevTools. */
  @Get('characters/:id')
  async getCharacterRow(@Param('id') id: string) {
    const row = await this.adminService.getCharacterRow(id);
    if (!row) throw new NotFoundException(`Personnage "${id}" introuvable.`);
    return row;
  }

  @Get('characters/:id/details')
  async getCharacterDetails(@Param('id') id: string) {
    const details = await this.adminService.getCharacterDetails(id);
    if (!details) throw new NotFoundException(`Personnage "${id}" introuvable.`);
    return details;
  }

  /**
   * GET /admin/characters/:characterId/skill-unlocks
   * Vue admin du déverrouillage des skills d'un personnage (V1-H-B). Renvoie
   * tout le catalogue (dont passive/aura) avec l'état résolu par personnage.
   */
  @Get('characters/:characterId/skill-unlocks')
  async getCharacterSkillUnlocks(@Param('characterId') characterId: string) {
    const character = await this.adminService.findCharacterById(characterId);
    if (!character) throw new NotFoundException(`Personnage "${characterId}" introuvable.`);
    const skills = await this.activeSkillsService.getCharacterSkillUnlocks(characterId);
    return { characterId, skills };
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
   * Action destructive : recalcule `level`/`experience` de tous les
   * personnages depuis leur XP cumulée et la courbe XP actuelle, remet à 0
   * les stats primaires distribuées, et recalcule `unspentStatPoints` depuis
   * le nouveau niveau. Exige `{ confirm: true }` (ADR-0018 §1).
   */
  @Post('game-config/recalculate-character-progression')
  recalculateCharacterProgression(@Body() dto: RecalculateCharacterProgressionDto) {
    return this.adminService.recalculateCharacterProgression(dto);
  }

  // ── Coefficients des stats dérivées (DerivedStatDefinition) ─────────────────

  @Get('derived-stat-definitions')
  getDerivedStatDefinitions() {
    return this.derivedStatsService.getDefinitions();
  }

  @Get('derived-stat-definitions/:key')
  getDerivedStatDefinition(@Param('key') key: string) {
    return this.derivedStatsService.getDefinition(key);
  }

  /** Studio « Stats secondaires » (V3-A) — key immuable, pas de DELETE (enabled=false). */
  @Post('derived-stat-definitions')
  createDerivedStatDefinition(@Body() dto: CreateDerivedStatDefinitionDto) {
    return this.derivedStatsService.createDefinition(dto);
  }

  @Patch('derived-stat-definitions/:key')
  updateDerivedStatDefinition(
    @Param('key') key: string,
    @Body() dto: UpdateDerivedStatDefinitionDto,
  ) {
    return this.derivedStatsService.updateDefinition(key, dto);
  }

  /** Références d'une stat dérivée + éligibilité à la suppression (V3 maintenance). */
  @Get('derived-stat-definitions/:key/references')
  getDerivedStatReferences(@Param('key') key: string) {
    return this.masteriesService.getStatReferencesReport(key);
  }

  /**
   * Suppression sûre d'une stat dérivée CUSTOM (V3 maintenance) :
   * refuse système, refuse si encore référencée, refuse clé inconnue.
   */
  @Delete('derived-stat-definitions/:key')
  async deleteDerivedStatDefinition(@Param('key') key: string) {
    const report = await this.masteriesService.getStatReferencesReport(key);
    if (report.isSystem) {
      throw new BadRequestException('Stat système non supprimable.');
    }
    if (!report.canDelete) {
      throw new BadRequestException(
        'Stat encore référencée par des effets de maîtrise. Désactive la stat ou retire les références avant suppression.',
      );
    }
    await this.derivedStatsService.deleteDefinition(key);
    return { deleted: true, key };
  }

  /** Retire un modifier d'effet de maîtrise ciblant cette stat (V3 maintenance). */
  @Post('derived-stat-definitions/:key/remove-mastery-reference')
  removeMasteryReference(
    @Param('key') _key: string,
    @Body() dto: RemoveMasteryReferenceDto,
  ) {
    return this.masteriesService.removeEffectModifier(dto.masteryKey, dto.modifierIndex);
  }

  @Post('derived-stat-definitions/preview')
  previewDerivedStats(@Body() dto: PreviewDerivedStatsDto) {
    return this.derivedStatsService.previewDerivedStats(dto);
  }

  // ── Skills actifs — catalogue (SkillDefinition, ADR-0019 V1-A) ──────────────

  @Get('skill-definitions')
  getSkillDefinitions() {
    return this.activeSkillsService.listDefinitions();
  }

  @Get('skill-definitions/:key')
  getSkillDefinition(@Param('key') key: string) {
    return this.activeSkillsService.getDefinition(key);
  }

  @Post('skill-definitions')
  createSkillDefinition(@Body() dto: CreateSkillDefinitionDto) {
    return this.activeSkillsService.createDefinition(dto);
  }

  @Patch('skill-definitions/:key')
  updateSkillDefinition(
    @Param('key') key: string,
    @Body() dto: UpdateSkillDefinitionDto,
  ) {
    return this.activeSkillsService.updateDefinition(key, dto);
  }

  /**
   * Suppression physique (sûre en V1-A : aucune référence). Pour retirer un
   * skill du jeu en préservant sa `key`, préférer PATCH `{ enabled: false }`.
   */
  @Delete('skill-definitions/:key')
  deleteSkillDefinition(@Param('key') key: string) {
    return this.activeSkillsService.deleteDefinition(key);
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

  // ── Masteries ────────────────────────────────────────────────────────────────

  /**
   * Catalogue des stats ciblables par les mastery effects (V2-E) — source
   * serveur unique (`mastery-effect-targets.ts`, partagée avec sanitize).
   * Lecture pure de constantes : le Studio ne code aucune liste en dur.
   */
  @Get('mastery-effect-targets')
  async getMasteryEffectTargets() {
    return {
      // V3-B : targets construits depuis les DerivedStatDefinition
      // (enabled + masteryEligible + implemented + au moins un mode).
      targets: await this.masteriesService.getMasteryEffectTargets(),
      modes: MASTERY_EFFECT_MODES,
      contextualStats: CONTEXTUAL_MASTERY_EFFECT_STATS,
    };
  }

  @Get('mastery-definitions')
  getMasteryDefinitions() { return this.adminService.getMasteryDefinitions(); }

  @Get('mastery-definitions/world-objects')
  getMasteryDefinitionWorldObjects() { return this.adminService.getMasteryDefinitionWorldObjects(); }

  @Get('mastery-definitions/:key')
  getMasteryDefinition(@Param('key') key: string) {
    return this.masteriesService.getMasteryDefinitionByKey(key);
  }

  @Post('mastery-definitions')
  createMasteryDefinition(@Body() dto: CreateMasteryDefinitionDto) {
    return this.masteriesService.createMasteryDefinition(dto);
  }

  /**
   * Patch partiel — `key` immuable (absente du DTO, rejetée par le
   * ValidationPipe). Pas de DELETE en V1-C : pour retirer une maîtrise du jeu,
   * PATCH `{ enabled: false }` (réversible, player_mastery conservé).
   */
  @Patch('mastery-definitions/:key')
  updateMasteryDefinition(
    @Param('key') key: string,
    @Body() dto: UpdateMasteryDefinitionDto,
  ) {
    return this.masteriesService.updateMasteryDefinition(key, dto);
  }

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
