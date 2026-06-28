import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';
import { CharactersModule } from '../characters/characters.module';
import { BankService } from './bank.service';
import { BankController } from './bank.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ItemInstance, Item]),
    ItemTransferModule,
    CharactersModule,
  ],
  providers: [BankService],
  controllers: [BankController],
  exports: [BankService],
})
export class BankModule {}
