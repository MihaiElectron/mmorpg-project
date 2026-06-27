import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TransactionType {
  LOOT = 'LOOT',
  QUEST = 'QUEST',
  AUCTION_BUY = 'AUCTION_BUY',
  AUCTION_SELL = 'AUCTION_SELL',
  AUCTION_REFUND = 'AUCTION_REFUND',
  NPC_BUY = 'NPC_BUY',
  NPC_SELL = 'NPC_SELL',
  CRAFT_PAYMENT = 'CRAFT_PAYMENT',
  TAX = 'TAX',
  TREASURY = 'TREASURY',
  PLAYER_TRADE = 'PLAYER_TRADE',
  GUILD = 'GUILD',
  BANK = 'BANK',
  ADMIN = 'ADMIN',
  REVERSAL = 'REVERSAL',
}

export enum TransactionStatus {
  REQUESTED = 'REQUESTED',
  VALIDATING = 'VALIDATING',
  REJECTED = 'REJECTED',
  RESERVED = 'RESERVED',
  APPLIED = 'APPLIED',
  ROLLED_BACK = 'ROLLED_BACK',
  FAILED = 'FAILED',
  REQUIRES_REVIEW = 'REQUIRES_REVIEW',
}

@Entity('economic_transaction')
export class EconomicTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  type: TransactionType;

  @Column({ type: 'varchar', length: 30 })
  status: TransactionStatus;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  sourceWalletId: string | null;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  destinationWalletId: string | null;

  @Column({ type: 'bigint' })
  amountBronze: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  idempotencyKey: string | null;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  actorId: string | null;

  @Column({ type: 'varchar', nullable: true })
  correlationId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamp', nullable: true })
  committedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
