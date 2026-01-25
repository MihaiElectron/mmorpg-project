import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { CharacterService } from './character.service';
import { CharacterController } from './character.controller';

import { ItemModule } from '../items/item.module';
import { Item } from '../items/entities/item.entity';
import { Inventory } from '../inventory/entities/inventory.entity';

@Module({
  imports: [
    // -------------------------------------------------------------------------
    // Entités utilisées DIRECTEMENT par CharacterService
    // (obligatoire pour @InjectRepository)
    // -------------------------------------------------------------------------
    TypeOrmModule.forFeature([Character, CharacterEquipment, Item, Inventory]),

    // -------------------------------------------------------------------------
    // Module Item conservé (rien supprimé)
    // -------------------------------------------------------------------------
    ItemModule,
  ],
  controllers: [CharacterController],
  providers: [CharacterService],
  exports: [CharacterService],
})
export class CharactersModule {}
