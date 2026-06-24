import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingIngredient } from './entities/crafting-ingredient.entity';
import { CraftingResult } from './entities/crafting-result.entity';
import { CraftingService } from './crafting.service';
import { CraftingController } from './crafting.controller';
import { CraftingGateway } from './crafting.gateway';
import { SkillsModule } from '../skills/skills.module';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CraftingRecipe,
      CraftingIngredient,
      CraftingResult,
      Item, // nécessaire pour la résolution des items au seed
    ]),
    SkillsModule,      // pour SkillsService (helpers transactionnels craft)
    CharactersModule,  // pour CharacterService (résolution characterId côté serveur)
  ],
  controllers: [CraftingController],
  providers: [CraftingService, CraftingGateway],
  exports: [CraftingService],
})
export class CraftingModule {}
