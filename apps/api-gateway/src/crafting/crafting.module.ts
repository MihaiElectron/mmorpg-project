import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingIngredient } from './entities/crafting-ingredient.entity';
import { CraftingResult } from './entities/crafting-result.entity';
import { CraftingStationTemplate } from './entities/crafting-station-template.entity';
import { CraftingStation } from './entities/crafting-station.entity';
import { CraftingService } from './crafting.service';
import { CraftingController } from './crafting.controller';
import { CraftingGateway } from './crafting.gateway';
import { SkillsModule } from '../skills/skills.module';
import { CharactersModule } from '../characters/characters.module';
import { WorldModule } from '../world/world.module';
import { ItemMaterializationModule } from '../item-materialization/item-materialization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CraftingRecipe,
      CraftingIngredient,
      CraftingResult,
      CraftingStationTemplate,
      CraftingStation,
      Item, // nécessaire pour la résolution des items au seed
    ]),
    SkillsModule,               // pour SkillsService (helpers transactionnels craft)
    CharactersModule,           // pour CharacterService (résolution characterId côté serveur)
    WorldModule,                // pour position serveur connectée
    ItemMaterializationModule,  // pour matérialisation des résultats de craft
  ],
  controllers: [CraftingController],
  providers: [CraftingService, CraftingGateway],
  exports: [CraftingService],
})
export class CraftingModule {}
