import { Controller, Get, Patch, Param, Body, UseGuards, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AnimalsService } from '../animals/animals.service';
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
    private readonly animalsService: AnimalsService,
  ) {}

  @Get('overview')
  getOverview() { return this.adminService.getOverview(); }

  // ── Animaux (instances vivantes) ─────────────────────────────────────────

  @Get('animals')
  getAnimals() { return this.animalsService.findAll(); }

  // ── Créatures ─────────────────────────────────────────────────────────────

  @Get('templates')
  getTemplates() { return this.adminService.getTemplates(); }

  @Get('spawns')
  getSpawns() { return this.adminService.getSpawns(); }

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
}
