import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailMessage } from './entities/mail-message.entity';
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { ItemTransferModule } from '../item-transfer/item-transfer.module';
import { CharactersModule } from '../characters/characters.module';
import { MailService } from './mail.service';
import { MailController } from './mail.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MailMessage, ItemInstance, Item]),
    ItemTransferModule,
    CharactersModule,
  ],
  providers: [MailService],
  controllers: [MailController],
  exports: [MailService],
})
export class MailModule {}
