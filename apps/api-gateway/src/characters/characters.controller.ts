/**
 * CharactersController — Version MVP propre et extensible
 * -----------------------------------------------------------------------------
 * Routes :
 * - POST /characters        → créer un personnage
 * - GET /characters/me      → récupérer le personnage du joueur
 * - DELETE /characters/:id  → supprimer le personnage
 * - POST /characters/equip  → équiper un item (MVP)
 * -----------------------------------------------------------------------------
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  NotFoundException,
  ParseIntPipe,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';

import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { EquipItemDto } from './dto/equip-item.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiBearerAuth()
@ApiTags('characters')
@UseGuards(JwtAuthGuard)
@Controller('characters')
export class CharactersController {
  /**
   * Constructeur
   * -----------------------------------------------------------------------------
   * Injection du CharactersService sous le nom "service".
   * -----------------------------------------------------------------------------
   */
  constructor(private readonly service: CharactersService) {}

  /**
   * GET /characters/me
   * -----------------------------------------------------------------------------
   * Retourne le personnage unique de l'utilisateur connecté.
   * Renvoie 404 si aucun personnage n'existe encore.
   * -----------------------------------------------------------------------------
   */
  @Get('me')
  @ApiOkResponse({ description: 'Personnage trouvé' })
  @ApiNotFoundResponse({ description: 'Aucun personnage trouvé pour cet utilisateur' })
  async getMine(@CurrentUser() user) {
    const character = await this.service.findOneByUserId(user.userId);

    if (!character) {
      throw new NotFoundException('Aucun personnage trouvé pour cet utilisateur');
    }

    return character;
  }

  /**
   * POST /characters
   * -----------------------------------------------------------------------------
   * Crée un personnage pour l'utilisateur connecté.
   * Renvoie 400 si les données sont invalides.
   * -----------------------------------------------------------------------------
   */
  @Post()
  @ApiCreatedResponse({ description: 'Personnage créé' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  create(@CurrentUser() user, @Body() dto: CreateCharacterDto) {
    return this.service.create(dto, user.userId);
  }

  /**
   * DELETE /characters/:id
   * -----------------------------------------------------------------------------
   * Supprime le personnage si :
   * - il appartient à l'utilisateur
   * - il existe
   * -----------------------------------------------------------------------------
   */
  @Delete(':id')
  @ApiOkResponse({ description: 'Personnage supprimé' })
  @ApiNotFoundResponse({ description: 'Personnage introuvable ou non autorisé' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user,
  ) {
    return this.service.removeForUser(id, user.userId);
  }

  /**
   * POST /characters/equip
   * -----------------------------------------------------------------------------
   * Rôle :
   * - Permet au joueur connecté d’équiper un item dans un slot.
   *
   * Sécurité :
   * - Protégé par JWT (JwtAuthGuard).
   *
   * Données attendues :
   * - Body : { slot, itemId } (EquipItemDto)
   *
   * Retour :
   * - Le slot mis à jour ou créé.
   * -----------------------------------------------------------------------------
   */
  @Post('equip')
  async equipItem(
    @CurrentUser() user,
    @Body() dto: EquipItemDto,
  ) {
    const slot = await this.service.equipItemForUser(user.userId, dto);

    return {
      message: 'Item équipé avec succès.',
      data: slot,
    };
  }
}
