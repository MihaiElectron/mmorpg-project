import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum MailStatus {
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  EXPIRED = 'EXPIRED',
  RETURNED = 'RETURNED',
}

export const MAIL_DEFAULT_TTL_DAYS = 30;

@Entity('mail_message')
export class MailMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  senderCharacterId: string;

  @Column({ type: 'varchar' })
  @Index()
  recipientCharacterId: string;

  @Column({ type: 'varchar', length: 120 })
  subject: string;

  @Column({ type: 'text', default: '' })
  body: string;

  @Column({ type: 'varchar', nullable: true })
  attachedItemInstanceId: string | null;

  @Column({ type: 'bigint', nullable: true })
  attachedAmountBronze: string | null;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  status: MailStatus;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp' })
  @Index()
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  claimedAt: Date | null;
}
