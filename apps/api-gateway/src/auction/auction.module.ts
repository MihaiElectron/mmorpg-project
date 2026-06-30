import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AuctionListing } from './entities/auction-listing.entity';
import { AuctionService } from './auction.service';
import { AuctionController } from './auction.controller';
import { AuctionScheduler } from './auction.scheduler';
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';
import { EconomyModule } from '../economy/economy.module';
import { MailModule } from '../mail/mail.module';
import { CharactersModule } from '../characters/characters.module';
import { WorldModule } from '../world/world.module';
import { BuildingsModule } from '../buildings/buildings.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([AuctionListing, ItemInstance, Item]),
    ItemTransferModule,
    EconomyModule,
    MailModule,
    CharactersModule,
    WorldModule,
    BuildingsModule,
  ],
  providers: [AuctionService, AuctionScheduler],
  controllers: [AuctionController],
  exports: [AuctionService],
})
export class AuctionModule {}
