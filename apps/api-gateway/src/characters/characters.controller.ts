// characters.controller.ts
// Rôle : définit les endpoints REST pour la ressource "characters".
// Toutes les routes sont protégées par JWT grâce à @UseGuards(JwtAuthGuard).

import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBody, ApiResponse } from '@nestjs/swagger';
import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('characters')
@UseGuards(JwtAuthGuard) // Toutes les routes nécessitent un token JWT
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
  update(@Param('id') id: string, @Body() updateCharacterDto: UpdateCharacterDto) {
    return this.charactersService.update(+id, updateCharacterDto);
  }

  @Delete(':id')
  @ApiResponse({ status: 200, description: 'Personnage supprimé.' })
  remove(@Param('id') id: string) {
    return this.charactersService.remove(+id);
  }
}
