import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from './entities/item.entity';
import { ItemService } from './item.service';
import { ItemController } from './item.controller';
import { Inventory } from '../inventory/entities/inventory.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { ResourceTemplate } from '../resources/entities/resource-template.entity';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import { CraftingIngredient } from '../crafting/entities/crafting-ingredient.entity';
import { CraftingResult } from '../crafting/entities/crafting-result.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Item,
      Inventory,
      CharacterEquipment,
      ResourceTemplate,
      CreatureTemplate,
      CraftingIngredient,
      CraftingResult,
    ]),
  ],
  controllers: [ItemController],
  providers: [ItemService],
  exports: [ItemService, TypeOrmModule],
})
export class ItemModule {}
