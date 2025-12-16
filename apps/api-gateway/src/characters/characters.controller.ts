// characters.controller.ts
// Rôle : définit les endpoints REST pour la ressource "characters".
// Chaque fonction correspond à une opération CRUD exposée via HTTP.

import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiBody, ApiResponse } from '@nestjs/swagger';
import { CharactersService } from './characters.service';
import { CreateCharacterDto } from './dto/create-character.dto';
import { UpdateCharacterDto } from './dto/update-character.dto';

@ApiTags('characters')
@Controller('characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  // create() : endpoint POST /characters
  // Permet de créer un nouveau personnage en recevant un DTO.
  @Post()
  @ApiBody({ type: CreateCharacterDto })
  @ApiResponse({ status: 201, description: 'Personnage créé avec succès.' })
  create(@Body() createCharacterDto: CreateCharacterDto) {
    return this.charactersService.create(createCharacterDto);
  }

  // findAll() : endpoint GET /characters
  // Retourne la liste de tous les personnages.
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
