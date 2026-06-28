import { Module } from '@nestjs/common';
import { ItemMaterializationService } from './item-materialization.service';

@Module({
  providers: [ItemMaterializationService],
  exports: [ItemMaterializationService],
})
export class ItemMaterializationModule {}
