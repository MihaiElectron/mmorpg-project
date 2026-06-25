import { BadRequestException, Controller, Get, Patch, Post, Param, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { CreaturesService } from '../creatures/creatures.service';
import { ResourcesService } from '../resources/resources.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly creaturesService: CreaturesService,
    private readonly resourcesService: ResourcesService,
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
  async updateTemplate(@Param('key') key: string, @Body() fields: Record<string, number>) {
    const updated = await this.adminService.updateTemplate(key, fields);
    if (!updated) throw new NotFoundException(`Template "${key}" introuvable.`);
    return updated;
  }

  // ── Joueurs ───────────────────────────────────────────────────────────────

  @Get('characters')
  getCharacters() { return this.adminService.getCharacters(); }

  @Patch('characters/:id')
  async updateCharacter(@Param('id') id: string, @Body() fields: Record<string, number>) {
    const updated = await this.adminService.updateCharacter(id, fields);
    if (!updated) throw new NotFoundException(`Personnage "${id}" introuvable.`);
    return updated;
  }

  // ── Ressources ────────────────────────────────────────────────────────────

  @Get('resource-templates')
  getResourceTemplates() { return this.adminService.getResourceTemplates(); }

  @Post('resource-templates')
  async createResourceTemplate(@Body() body: { fields: Record<string, unknown> }) {
    return this.adminService.createResourceTemplate((body?.fields ?? {}) as any);
  }

  @Patch('resource-templates/:type')
  async updateResourceTemplate(@Param('type') type: string, @Body() fields: Record<string, number>) {
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
}
