/**
 * CharactersController
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Expose les endpoints REST liés aux personnages (CRUD + équipement).
 * - Toutes les routes sont protégées par JWT via JwtAuthGuard.
 *
 * Emplacement :
 * mmorpg-project/apps/api-gateway/src/characters/characters.controller.ts
 *
 * Endpoints :
 * - POST /characters           → créer un personnage
 * - GET /characters            → lister tous les personnages
 * - GET /characters/:id        → récupérer un personnage
 * - PATCH /characters/:id      → mettre à jour un personnage
 * - DELETE /characters/:id     → supprimer un personnage
 * - POST /characters/:id/equip → équiper un item dans un slot
 *
 * Remarques :
 * - L’endpoint /equip délègue la logique à CharactersService.equipItem().
 * - EquipItemDto valide le payload envoyé par le frontend.
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
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBody,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request } from 'express';


import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { EquipItemDto } from './dto/equip-item.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiBearerAuth()
@ApiTags('characters')
@UseGuards(JwtAuthGuard)
@Controller('characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  /**
   * POST /characters
   * Crée un nouveau personnage pour l'utilisateur authentifié.
   * - Récupère l'userId depuis le token JWT (payload.sub)
   * - L'injecte dans le DTO avant de déléguer au service.
   */
  @Post()
  @ApiBody({ type: CreateCharacterDto })
  @ApiResponse({ status: 201, description: 'Personnage créé avec succès.' })
  create(@Req() req: Request, @Body() dto: CreateCharacterDto) {
    // req.user est ajouté par JwtStrategy via Passport.
    // On caste en any car Express ne connaît pas la propriété "user" par défaut.
    const user = (req as any).user;
    dto.userId = user.sub;

    return this.charactersService.create(dto);
  }

  /**
   * GET /characters
   * Retourne la liste de tous les personnages (avec leur équipement).
   */
  @Get()
  findAll() {
    return this.charactersService.findAll();
  }

  /**
   * GET /characters/:id
   * Récupère un personnage spécifique par son ID.
   */
  @Get(':id')
  @ApiParam({ name: 'id', type: Number, description: 'ID du personnage' })
  findOne(@Param('id') id: string) {
    return this.charactersService.findOne(+id);
  }

  /**
   * PATCH /characters/:id
   * Met à jour les informations d'un personnage.
   */
  @Patch(':id')
  @ApiParam({ name: 'id', type: Number, description: 'ID du personnage' })
  update(@Param('id') id: string, @Body() dto: UpdateCharacterDto) {
    return this.charactersService.update(+id, dto);
  }

  /**
   * DELETE /characters/:id
   * Supprime un personnage.
   */
  @Delete(':id')
  @ApiParam({ name: 'id', type: Number, description: 'ID du personnage' })
  remove(@Param('id') id: string) {
    return this.charactersService.remove(+id);
  }

  /**
   * POST /characters/:id/equip
   * Équipe un item dans un slot d'un personnage.
   */
  @Post(':id/equip')
  @ApiParam({ name: 'id', type: Number, description: 'ID du personnage' })
  @ApiBody({ type: EquipItemDto })
  equipItem(@Param('id') id: string, @Body() dto: EquipItemDto) {
    return this.charactersService.equipItem(+id, dto);
  }
}
