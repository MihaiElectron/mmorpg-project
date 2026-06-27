import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Character } from '../../characters/entities/character.entity';
import { Item } from '../../items/entities/item.entity';

export enum WorldItemState {
  SPAWNED = 'spawned',
  PICKED = 'picked',
  EXPIRED = 'expired',
}

@Entity()
@Index(['mapId', 'state'])
@Index(['expiresAt'])
export class WorldItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'itemId' })
  item: Item;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'integer' })
  worldX: number;

  @Column({ type: 'integer' })
  worldY: number;

  @Column({ type: 'integer' })
  mapId: number;

  @Column({ type: 'uuid', nullable: true })
  ownerCharacterId: string | null;

  @ManyToOne(() => Character, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ownerCharacterId' })
  ownerCharacter: Character | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({
    type: 'enum',
    enum: WorldItemState,
    default: WorldItemState.SPAWNED,
  })
  state: WorldItemState;
}
