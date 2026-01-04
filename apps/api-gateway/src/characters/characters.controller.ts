/**
 * CharactersController (sécurisé)
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Toutes les actions sont limitées au joueur authentifié.
 * - Un joueur ne peut voir / modifier / équiper que SES personnages.
 * - Le userId est extrait automatiquement via @CurrentUser().
 * -----------------------------------------------------------------------------
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { EquipItemDto } from './dto/equip-item.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiBearerAuth()
@ApiTags('characters')
@UseGuards(JwtAuthGuard)
@Controller('characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  /**
   * POST /characters
   * Crée un personnage pour l'utilisateur connecté.
   */
  @Post()
  @ApiBody({ type: CreateCharacterDto })
  @ApiResponse({ status: 201, description: 'Personnage créé avec succès.' })
  create(@CurrentUser() user, @Body() dto: CreateCharacterDto) {
    return this.charactersService.create(dto, user.userId);
  }

  /**
   * GET /characters
   * Retourne uniquement les personnages du joueur connecté.
   */
  @Get()
  findAll(@CurrentUser() user) {
    return this.charactersService.findByUserId(user.userId);
  }

  /**
   * GET /characters/:id
   * Retourne un personnage appartenant au joueur.
   */
  @Get(':id')
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id') id: string, @CurrentUser() user) {
    return this.charactersService.findOneForUser(+id, user.userId);
  }

  /**
   * PATCH /characters/:id
   * Met à jour un personnage appartenant au joueur.
   */
  @Patch(':id')
  @ApiParam({ name: 'id', type: Number })
  update(@Param('id') id: string, @Body() dto: UpdateCharacterDto, @CurrentUser() user) {
    return this.charactersService.updateForUser(+id, dto, user.userId);
  }

  /**
   * DELETE /characters/:id
   * Supprime un personnage appartenant au joueur.
   */
  @Delete(':id')
  @ApiParam({ name: 'id', type: Number })
  remove(@Param('id') id: string, @CurrentUser() user) {
    return this.charactersService.removeForUser(+id, user.userId);
  }

  /**
   * POST /characters/:id/equip
   * Équipe un item sur un personnage appartenant au joueur.
   */
  @Post(':id/equip')
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: EquipItemDto })
  equipItem(@Param('id') id: string, @Body() dto: EquipItemDto, @CurrentUser() user) {
    return this.charactersService.equipItemForUser(+id, dto, user.userId);
  }
}
