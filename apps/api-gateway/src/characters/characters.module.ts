/**
 * CharactersModule
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Déclare le module Characters et enregistre les entités nécessaires.
 * - Fournit CharactersService et CharactersController.
 * - Active l’injection des repositories Character et CharacterEquipment.
 *
 * Emplacement :
 * mmorpg-project/apps/api-gateway/src/characters/characters.module.ts
 *
 * Remarques :
 * - TypeOrmModule.forFeature() permet à NestJS d’injecter les repositories
 *   dans CharactersService.
 * -----------------------------------------------------------------------------
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CharactersService } from './characters.service';
import { CharactersController } from './characters.controller';

import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Character, CharacterEquipment]), // Injection des repositories
  ],
  controllers: [CharactersController],
  providers: [CharactersService],
  exports: [CharactersService],
})
export class CharactersModule {}
