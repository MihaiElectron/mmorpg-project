import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import { CreatureSpawn } from '../creatures/entities/creature-spawn.entity';
import { Creature } from '../creatures/entities/creature.entity';
import { Character } from '../characters/entities/character.entity';
import { Resource } from '../resources/entities/resource.entity';
import { ResourceTemplate } from '../resources/entities/resource-template.entity';
import { SkillDefinition } from '../skills/entities/skill-definition.entity';
import { PlayerSkill } from '../skills/entities/player-skill.entity';
import { CraftingRecipe } from '../crafting/entities/crafting-recipe.entity';
import { CraftingIngredient } from '../crafting/entities/crafting-ingredient.entity';
import { CraftingResult } from '../crafting/entities/crafting-result.entity';
import { CraftingStationTemplate } from '../crafting/entities/crafting-station-template.entity';
import { CraftingStation } from '../crafting/entities/crafting-station.entity';
import { Item } from '../items/entities/item.entity';
import { CreaturesModule } from '../creatures/creatures.module';
import { ResourcesModule } from '../resources/resources.module';
import { WorldModule } from '../world/world.module';
import { CommonModule } from '../common/common.module';
import { BuildingsModule } from '../buildings/buildings.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminGateway } from './admin.gateway';
import { EconomyModule } from '../economy/economy.module';
import { ItemMaterializationModule } from '../item-materialization/item-materialization.module';
import { ItemModule } from '../items/item.module';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreatureTemplate, CreatureSpawn, Creature, Character,
      Resource, ResourceTemplate,
      SkillDefinition, PlayerSkill,
      CraftingRecipe, CraftingIngredient, CraftingResult,
      CraftingStationTemplate, CraftingStation,
      Item,
    ]),
    CreaturesModule,
    ResourcesModule,
    WorldModule,
    CommonModule,
    BuildingsModule,
    EconomyModule,
    ItemMaterializationModule,
    ItemModule,
    ItemTransferModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGateway],
})
export class AdminModule {}
