import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingIngredient } from './entities/crafting-ingredient.entity';
import { CraftingResult } from './entities/crafting-result.entity';
import { CraftingStationTemplate } from './entities/crafting-station-template.entity';
import { CraftingStation } from './entities/crafting-station.entity';
import { CraftJob } from './entities/craft-job.entity';
import { CraftJobIngredient } from './entities/craft-job-ingredient.entity';
import { CraftJobOutput } from './entities/craft-job-output.entity';
import { CraftingService } from './crafting.service';
import { CraftJobService } from './craft-job.service';
import { CraftJobScheduler } from './craft-job.scheduler';
import { CraftingController } from './crafting.controller';
import { SkillsModule } from '../skills/skills.module';
import { CharactersModule } from '../characters/characters.module';
import { WorldModule } from '../world/world.module';
import { ItemMaterializationModule } from '../item-materialization/item-materialization.module';
import { ProgressionModule } from '../progression/progression.module';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CraftingRecipe,
      CraftingIngredient,
      CraftingResult,
      CraftingStationTemplate,
      CraftingStation,
      CraftJob,
      CraftJobIngredient,
      CraftJobOutput,
      Item, // nécessaire pour la résolution des items au seed
    ]),
    SkillsModule,               // pour SkillsService (helpers transactionnels craft)
    CharactersModule,           // pour CharacterService (résolution characterId côté serveur)
    WorldModule,                // pour position serveur connectée
    ItemMaterializationModule,  // pour matérialisation des résultats de craft
    ProgressionModule,          // pour Character XP (ADR-0016)
    ItemTransferModule,         // pour consommer les ingrédients INSTANCE (CRAFT_CONSUME)
  ],
  controllers: [CraftingController],
  providers: [CraftingService, CraftJobService, CraftJobScheduler],
  exports: [CraftingService, CraftJobService],
})
export class CraftingModule {}
