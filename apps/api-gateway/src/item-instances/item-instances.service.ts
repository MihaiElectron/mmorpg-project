import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from './entities/item-instance.entity';

export interface CreateItemInstanceParams {
  itemId: string;
  ownerType: string;
  ownerId: string | null;
  state: ItemInstanceState;
  containerType: ItemInstanceContainerType;
  containerId: string | null;
}

@Injectable()
export class ItemInstancesService {
  constructor(
    @InjectRepository(ItemInstance)
    private readonly instances: Repository<ItemInstance>,
  ) {}

  async create(params: CreateItemInstanceParams): Promise<ItemInstance> {
    const instance = this.instances.create({
      itemId: params.itemId,
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      state: params.state,
      containerType: params.containerType,
      containerId: params.containerId,
    });
    return this.instances.save(instance);
  }
}
