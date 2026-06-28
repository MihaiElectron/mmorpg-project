import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';
import { CharactersModule } from '../characters/characters.module';
import { Guild } from './entities/guild.entity';
import { GuildStorageService } from './guild-storage.service';
import { GuildStorageController } from './guild-storage.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Guild, ItemInstance, Item]),
    ItemTransferModule,
    CharactersModule,
  ],
  providers: [GuildStorageService],
  controllers: [GuildStorageController],
  exports: [GuildStorageService],
})
export class GuildModule {}
