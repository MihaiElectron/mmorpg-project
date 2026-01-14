import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { CharacterService } from './character.service';
import { CharacterController } from './character.controller';
import { ItemModule } from '../items/item.module';
import { Item } from '../items/entities/item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Character, CharacterEquipment, Item]),
    ItemModule,
  ],
  controllers: [CharacterController],
  providers: [CharacterService],
  exports: [CharacterService],
})
export class CharactersModule {}

