import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ItemInstanceType } from '../enums/item-instance-type.enum';
import { ItemInstanceSource } from '../enums/item-instance-source.enum';

export { ItemInstanceType, ItemInstanceSource };

export enum ItemInstanceState {
  AVAILABLE = 'AVAILABLE',
  EQUIPPED = 'EQUIPPED',
  LOCKED = 'LOCKED',
  LISTED = 'LISTED',
  SOLD_PENDING_CLAIM = 'SOLD_PENDING_CLAIM',
  IN_WORLD = 'IN_WORLD',
  IN_MAIL = 'IN_MAIL',
  IN_BANK = 'IN_BANK',
  IN_GUILD_STORAGE = 'IN_GUILD_STORAGE',
  IN_HOUSING = 'IN_HOUSING',
  IN_TRADE = 'IN_TRADE',
  IN_CRAFT_ORDER = 'IN_CRAFT_ORDER',
  DESTROYED = 'DESTROYED',
  ARCHIVED = 'ARCHIVED',
}

export enum ItemInstanceContainerType {
  INVENTORY = 'INVENTORY',
  EQUIPMENT = 'EQUIPMENT',
  WORLD = 'WORLD',
  AUCTION = 'AUCTION',
  MAIL = 'MAIL',
  BANK = 'BANK',
  GUILD_STORAGE = 'GUILD_STORAGE',
  HOUSING = 'HOUSING',
  TRADE = 'TRADE',
  CRAFT_ORDER = 'CRAFT_ORDER',
  NONE = 'NONE',
}

@Entity('item_instance')
export class ItemInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  itemId: string;

  @Column({ type: 'varchar', length: 30 })
  ownerType: string;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  ownerId: string | null;

  @Column({ type: 'varchar', length: 30 })
  state: ItemInstanceState;

  @Column({ type: 'varchar', length: 30 })
  containerType: ItemInstanceContainerType;

  @Column({ type: 'varchar', nullable: true })
  containerId: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  createdBySource: ItemInstanceSource | null;

  @Column({ type: 'varchar', length: 10, default: ItemInstanceType.NORMAL })
  instanceType: ItemInstanceType;

  @Column({ type: 'int', nullable: true, default: null })
  quantity: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
