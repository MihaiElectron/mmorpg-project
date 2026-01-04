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
 * - EquipItemDto doit être importé pour valider le payload.
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
import { ApiTags, ApiBody, ApiResponse } from '@nestjs/swagger';
import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { EquipItemDto } from './dto/equip-item.dto'; // ✅ Import manquant corrigé
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('characters')
@UseGuards(JwtAuthGuard)
@Controller('characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Post()
  @ApiBody({ type: CreateCharacterDto })
  @ApiResponse({ status: 201, description: 'Personnage créé avec succès.' })
  create(@Body() createCharacterDto: CreateCharacterDto) {
    return this.charactersService.create(createCharacterDto);
  }

  @Get()
  @ApiResponse({ status: 200, description: 'Liste de tous les personnages.' })
  findAll() {
    return this.charactersService.findAll();
  }

  @Get(':id')
  @ApiResponse({ status: 200, description: 'Retourne un personnage par ID.' })
  findOne(@Param('id') id: string) {
    return this.charactersService.findOne(+id);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateCharacterDto })
  @ApiResponse({ status: 200, description: 'Personnage mis à jour.' })
  update(
    @Param('id') id: string,
    @Body() updateCharacterDto: UpdateCharacterDto,
  ) {
    return this.charactersService.update(+id, updateCharacterDto);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Personnage supprimé.' })
  remove(@Param('id') id: string) {
    return this.charactersService.remove(+id);
  }

  @Post(':id/equip')
  @ApiBody({ type: EquipItemDto })
  @ApiResponse({ status: 200, description: 'Équipement mis à jour.' })
  equipItem(
    @Param('id') characterId: number,
    @Body() dto: EquipItemDto,
  ) {
    return this.charactersService.equipItem(characterId, dto); // ✅ Correction du service
  }
}
