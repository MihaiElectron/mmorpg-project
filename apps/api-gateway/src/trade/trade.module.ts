import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';
import { CharactersModule } from '../characters/characters.module';
import { TradeSession } from './entities/trade-session.entity';
import { TradeService } from './trade.service';
import { TradeController } from './trade.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TradeSession, ItemInstance, Item]),
    ItemTransferModule,
    CharactersModule,
  ],
  providers: [TradeService],
  controllers: [TradeController],
  exports: [TradeService],
})
export class TradeModule {}
