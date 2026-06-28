import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';
import { CharactersModule } from '../characters/characters.module';
import { House } from './entities/house.entity';
import { HousingService } from './housing.service';
import { HousingController } from './housing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([House, ItemInstance, Item]),
    ItemTransferModule,
    CharactersModule,
  ],
  providers: [HousingService],
  controllers: [HousingController],
  exports: [HousingService],
})
export class HousingModule {}
