import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AuctionListingStatus {
  LISTED = 'LISTED',
  SOLD_PENDING_CLAIM = 'SOLD_PENDING_CLAIM',
  SOLD_CLAIMED = 'SOLD_CLAIMED',
  EXPIRED_PENDING_CLAIM = 'EXPIRED_PENDING_CLAIM',
  EXPIRED_CLAIMED = 'EXPIRED_CLAIMED',
  CANCELLED_PENDING_CLAIM = 'CANCELLED_PENDING_CLAIM',
  CANCELLED_CLAIMED = 'CANCELLED_CLAIMED',
  ARCHIVED = 'ARCHIVED',
}

export const AUCTION_ALLOWED_DURATIONS_HOURS = [24, 48, 72] as const;
export type AuctionDurationHours = (typeof AUCTION_ALLOWED_DURATIONS_HOURS)[number];
export const AUCTION_MAX_ACTIVE_LISTINGS = 20;

@Entity('auction_listing')
export class AuctionListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  sellerCharacterId: string;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  buyerCharacterId: string | null;

  @Column({ type: 'varchar' })
  @Index()
  itemInstanceId: string;

  @Column({ type: 'varchar' })
  itemId: string;

  @Column({ type: 'bigint' })
  buyoutPriceBronze: string;

  @Column({ type: 'varchar', length: 30 })
  @Index()
  status: AuctionListingStatus;

  @Column({ type: 'timestamp' })
  startsAt: Date;

  @Column({ type: 'timestamp' })
  @Index()
  endsAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
