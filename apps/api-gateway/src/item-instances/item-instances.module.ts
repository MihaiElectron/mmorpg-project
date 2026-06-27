import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemInstance } from './entities/item-instance.entity';
import { ItemInstancesService } from './item-instances.service';

@Module({
  imports: [TypeOrmModule.forFeature([ItemInstance])],
  providers: [ItemInstancesService],
  exports: [ItemInstancesService],
})
export class ItemInstancesModule {}
