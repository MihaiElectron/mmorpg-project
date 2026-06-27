import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export enum WalletOwnerType {
  CHARACTER = 'CHARACTER',
  SYSTEM = 'SYSTEM',
  TREASURY = 'TREASURY',
  BANK = 'BANK',
  GUILD = 'GUILD',
}

export enum WalletStatus {
  ACTIVE = 'ACTIVE',
  FROZEN = 'FROZEN',
  CLOSED = 'CLOSED',
  ARCHIVED = 'ARCHIVED',
}

@Entity('wallet')
@Unique(['ownerType', 'ownerId'])
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  ownerType: string;

  @Column({ type: 'varchar' })
  @Index()
  ownerId: string;

  @Column({ type: 'bigint', default: '0' })
  balanceBronze: string;

  @Column({ type: 'varchar', length: 20, default: WalletStatus.ACTIVE })
  status: WalletStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
