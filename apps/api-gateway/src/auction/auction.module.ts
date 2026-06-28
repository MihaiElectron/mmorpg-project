import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuctionListing } from './entities/auction-listing.entity';
import { AuctionService } from './auction.service';
import { AuctionController } from './auction.controller';
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';
import { EconomyModule } from '../economy/economy.module';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuctionListing, ItemInstance, Item]),
    ItemTransferModule,
    EconomyModule,
    CharactersModule,
  ],
  providers: [AuctionService],
  controllers: [AuctionController],
  exports: [AuctionService],
})
export class AuctionModule {}
