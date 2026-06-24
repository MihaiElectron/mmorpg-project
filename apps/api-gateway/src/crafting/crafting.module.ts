import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingIngredient } from './entities/crafting-ingredient.entity';
import { CraftingResult } from './entities/crafting-result.entity';
import { CraftingService } from './crafting.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CraftingRecipe,
      CraftingIngredient,
      CraftingResult,
      Item, // nécessaire pour la résolution des items au seed
    ]),
  ],
  providers: [CraftingService],
  exports: [CraftingService],
})
export class CraftingModule {}
