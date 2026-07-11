import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CharacterService } from './character.service';
import { MasteriesService } from '../masteries/masteries.service';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { EquipItemDto } from './dto/equip-item.dto';
import { UnequipItemDto } from './dto/unequip-item.dto';
import { AllocateStatsDto } from './dto/allocate-stats.dto';
import { PreviewStatsDto } from './dto/preview-stats.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('characters')
@UseGuards(JwtAuthGuard)
export class CharacterController {
  constructor(
    private readonly characterService: CharacterService,
    private readonly masteriesService: MasteriesService,
    private readonly derivedStatsService: DerivedStatsService,
  ) {}

  /**
   * GET /characters/stat-definitions
   * Catalogue read-only (auth joueur) des stats principales + dérivées enabled,
   * avec leurs libellés serveur (V3-B). Le panneau joueur affiche ces clés/
   * labels et lit les VALEURS depuis `character.stats.derived` — jamais de
   * calcul client, jamais de route admin.
   */
  @Get('stat-definitions')
  getStatDefinitions() {
    return this.derivedStatsService.getStatCatalogForPlayer();
  }

  /**
   * POST /characters
   * Crée un nouveau personnage pour l'utilisateur authentifié
   */
  @Post()
  create(@Request() req, @Body() dto: CreateCharacterDto) {
    return this.characterService.create(req.user.userId, dto);
  }

  /**
   * GET /characters
   * Récupère tous les personnages de l'utilisateur authentifié
   */
  @Get()
  findAll(@Request() req) {
    return this.characterService.findAllByUser(req.user.userId);
  }

  /**
   * GET /characters/me
   * Récupère le personnage principal de l'utilisateur authentifié
   * (utilisé par le frontend pour charger le personnage courant)
   */
  @Get('me')
  findMe(@Request() req) {
    return this.characterService.findFirstByUserProjected(req.user.userId);
  }

  /**
   * GET /characters/me/masteries
   * Retourne les masteries du personnage principal avec niveau, XP et XP prochain niveau.
   */
  @Get('me/masteries')
  async findMyMasteries(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.masteriesService.getCharacterMasteries(character.id);
  }

  /**
   * POST /characters/me/stats/allocate
   * Alloue des points de stats sur le personnage principal de l'utilisateur.
   * Le characterId n'est jamais fourni par le client (dérivé du JWT).
   */
  @Post('me/stats/allocate')
  allocateStats(@Request() req, @Body() dto: AllocateStatsDto) {
    return this.characterService.allocateStats(req.user.userId, dto);
  }

  /**
   * POST /characters/me/stats-preview
   * Aperçu LECTURE SEULE de l'impact d'une répartition de points (avant
   * validation). Ne persiste rien — renvoie { primary, derived } calculés
   * serveur.
   */
  @Post('me/stats-preview')
  previewStats(@Request() req, @Body() dto: PreviewStatsDto) {
    return this.characterService.previewStats(req.user.userId, dto);
  }

  /**
   * GET /characters/:id
   * Récupère un personnage spécifique (vérifie la propriété)
   */
  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.characterService.findOne(id, req.user.userId);
  }

  /**
   * POST /characters/:id/equip
   * Équipe un item sur un personnage
   */
  @Post(':id/equip')
  equipItem(
    @Request() req,
    @Param('id') characterId: string,
    @Body() dto: EquipItemDto,
  ) {
    return this.characterService.equipItem(characterId, req.user.userId, dto);
  }

  /**
   * POST /characters/:id/unequip
   * Déséquipe un item d'un personnage
   */
  @Post(':id/unequip')
  unequipItem(
    @Request() req,
    @Param('id') characterId: string,
    @Body() dto: UnequipItemDto,
  ) {
    return this.characterService.unequipItem(characterId, req.user.userId, dto);
  }

  /**
   * DELETE /characters/:id
   * Supprime un personnage
   */
  @Delete(':id')
  remove(@Request() req, @Param('id') id: string) {
    return this.characterService.remove(id, req.user.userId);
  }
}
