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
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { WorldItem } from '../world-items/entities/world-item.entity';
import { AuctionListing } from '../auction/entities/auction-listing.entity';
import { MailMessage } from '../mail/entities/mail-message.entity';
import { Character } from '../characters/entities/character.entity';
import { DerivedStatsModule } from '../derived-stats/derived-stats.module';

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
      ItemInstance,
      WorldItem,
      AuctionListing,
      MailMessage,
      Character,
    ]),
    DerivedStatsModule,
  ],
  controllers: [ItemController],
  providers: [ItemService],
  exports: [ItemService, TypeOrmModule],
})
export class ItemModule {}
