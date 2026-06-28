import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum TradeSessionState {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('trade_session')
export class TradeSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  characterAId: string;

  @Column({ type: 'varchar' })
  @Index()
  characterBId: string;

  @Column({ type: 'varchar', length: 20, default: TradeSessionState.PENDING })
  state: TradeSessionState;

  @Column({ type: 'boolean', default: false })
  acceptedA: boolean;

  @Column({ type: 'boolean', default: false })
  acceptedB: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
