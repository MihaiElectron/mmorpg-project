import { Module } from '@nestjs/common';
import { ItemTransferService } from './item-transfer.service';

@Module({
  providers: [ItemTransferService],
  exports: [ItemTransferService],
})
export class ItemTransferModule {}
