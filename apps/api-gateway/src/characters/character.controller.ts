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
import { CreateCharacterDto } from './dto/create-character.dto';
import { EquipItemDto } from './dto/equip-item.dto';
import { UnequipItemDto } from './dto/unequip-item.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('characters')
@UseGuards(JwtAuthGuard)
export class CharacterController {
  constructor(private readonly characterService: CharacterService) {}

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
    return this.characterService.findFirstByUser(req.user.userId);
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
    return this.characterService.unequipItem(
      characterId,
      req.user.userId,
      dto,
    );
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

