import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum LedgerDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
  RESERVE = 'RESERVE',
  RELEASE = 'RELEASE',
  REVERSAL = 'REVERSAL',
}

@Entity('ledger_entry')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  transactionId: string;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  walletId: string | null;

  @Column({ type: 'varchar', length: 20 })
  direction: LedgerDirection;

  @Column({ type: 'bigint' })
  amountBronze: string;

  @Column({ type: 'bigint', nullable: true })
  balanceAfterBronze: string | null;

  @Column({ type: 'varchar', length: 50 })
  entryType: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
  // Intentionnellement sans UpdateDateColumn — les entrées de ledger sont append-only
}
