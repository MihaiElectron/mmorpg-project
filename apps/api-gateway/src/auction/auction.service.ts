import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { ItemInstance, ItemInstanceContainerType, ItemInstanceState } from '../item-instances/entities/item-instance.entity';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { EconomyService } from '../economy/economy.service';
import { TransactionType } from '../economy/entities/economic-transaction.entity';
import {
  AuctionListing,
  AuctionListingStatus,
  AUCTION_MAX_ACTIVE_LISTINGS,
  AuctionDurationHours,
} from './entities/auction-listing.entity';

export interface CreateListingInput {
  sellerCharacterId: string;
  itemInstanceId: string;
  buyoutPriceBronze: bigint;
  durationHours: AuctionDurationHours;
}

export interface BuyListingInput {
  buyerCharacterId: string;
  listingId: string;
}

@Injectable()
export class AuctionService {
  constructor(
    @InjectRepository(AuctionListing)
    private readonly listings: Repository<AuctionListing>,
    @InjectRepository(ItemInstance)
    private readonly instances: Repository<ItemInstance>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    private readonly dataSource: DataSource,
    private readonly itemTransfer: ItemTransferService,
    private readonly economy: EconomyService,
  ) {}

  // ── Lecture ──────────────────────────────────────────────────────────────

  async getActiveListings(): Promise<AuctionListing[]> {
    return this.listings.find({
      where: { status: AuctionListingStatus.LISTED },
      order: { createdAt: 'DESC' },
    });
  }

  async getSellerListings(sellerCharacterId: string): Promise<AuctionListing[]> {
    return this.listings.find({
      where: { sellerCharacterId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Création d'une annonce ───────────────────────────────────────────────

  async createListing(input: CreateListingInput): Promise<AuctionListing> {
    this.assertPositivePrice(input.buyoutPriceBronze);

    return this.dataSource.transaction(async (manager) => {
      // Pré-lecture de l'instance sans verrou pour résoudre itemId
      const rawInstance = await manager.findOne(ItemInstance, {
        where: { id: input.itemInstanceId },
      });
      if (!rawInstance) {
        throw new NotFoundException(`ItemInstance ${input.itemInstanceId} not found`);
      }
      this.assertOwner(rawInstance, input.sellerCharacterId);
      this.assertInstanceAvailableForListing(rawInstance);

      // Validation item.objectMode === INSTANCE
      const item = await manager.findOne(Item, { where: { id: rawInstance.itemId } });
      if (!item) throw new NotFoundException(`Item ${rawInstance.itemId} not found`);
      if (item.objectMode !== ObjectMode.INSTANCE) {
        throw new BadRequestException('Only INSTANCE items can be listed on the Auction House');
      }

      // Limite 20 annonces actives
      const activeCount = await manager
        .getRepository(AuctionListing)
        .count({ where: { sellerCharacterId: input.sellerCharacterId, status: AuctionListingStatus.LISTED } });
      if (activeCount >= AUCTION_MAX_ACTIVE_LISTINGS) {
        throw new BadRequestException(`Maximum ${AUCTION_MAX_ACTIVE_LISTINGS} active listings reached`);
      }

      const now = new Date();
      const endsAt = new Date(now.getTime() + input.durationHours * 60 * 60 * 1000);

      // Créer AuctionListing avant la transition (listingId requis comme containerId)
      const listing = manager.create(AuctionListing, {
        sellerCharacterId: input.sellerCharacterId,
        buyerCharacterId: null,
        itemInstanceId: input.itemInstanceId,
        itemId: item.id,
        buyoutPriceBronze: input.buyoutPriceBronze.toString(),
        status: AuctionListingStatus.LISTED,
        startsAt: now,
        endsAt,
      });
      const savedListing = await manager.save(AuctionListing, listing);

      // Transition ItemInstance : AVAILABLE+INVENTORY → LISTED+AUCTION+listingId
      await this.itemTransfer.transfer(manager, input.itemInstanceId, {
        requesterId: input.sellerCharacterId,
        transition: { type: 'LIST_FOR_AUCTION', listingId: savedListing.id },
      });

      return savedListing;
    });
  }

  // ── Annulation ───────────────────────────────────────────────────────────

  async cancelListing(sellerCharacterId: string, listingId: string): Promise<AuctionListing> {
    return this.dataSource.transaction(async (manager) => {
      const listing = await this.lockListing(manager, listingId);

      if (listing.sellerCharacterId !== sellerCharacterId) {
        throw new BadRequestException('Only the seller can cancel this listing');
      }
      if (listing.status !== AuctionListingStatus.LISTED) {
        throw new BadRequestException(`Cannot cancel listing with status ${listing.status}`);
      }

      // L'instance reste LISTED+AUCTION jusqu'au claim vendeur
      listing.status = AuctionListingStatus.CANCELLED_PENDING_CLAIM;
      return manager.save(AuctionListing, listing);
    });
  }

  // ── Achat ────────────────────────────────────────────────────────────────

  async buyListing(input: BuyListingInput): Promise<AuctionListing> {
    // Pré-résolution des wallets hors transaction (idempotent, safe)
    const previewListing = await this.listings.findOneBy({ id: input.listingId });
    if (!previewListing) throw new NotFoundException(`Listing ${input.listingId} not found`);
    if (previewListing.sellerCharacterId === input.buyerCharacterId) {
      throw new BadRequestException('Cannot buy your own listing');
    }

    const [buyerWallet, sellerWallet] = await Promise.all([
      this.economy.getOrCreateWallet('character', input.buyerCharacterId),
      this.economy.getOrCreateWallet('character', previewListing.sellerCharacterId),
    ]);

    return this.dataSource.transaction(async (manager) => {
      // Verrou 1 : AuctionListing
      const listing = await this.lockListing(manager, input.listingId);

      if (listing.status !== AuctionListingStatus.LISTED) {
        throw new BadRequestException(`Listing is not available for purchase (status: ${listing.status})`);
      }
      if (listing.endsAt <= new Date()) {
        throw new BadRequestException('Listing has expired');
      }

      const price = BigInt(listing.buyoutPriceBronze);

      // Verrou 2 : wallets + transfert monétaire atomique
      await this.economy.transferWithinManager(manager, {
        type: TransactionType.AUCTION_BUY,
        sourceWalletId: buyerWallet.id,
        destinationWalletId: sellerWallet.id,
        amountBronze: price,
        correlationId: listing.id,
      });

      // Verrou 3 : ItemInstance (via ItemTransferService.lockInstance)
      await this.itemTransfer.transfer(manager, listing.itemInstanceId, {
        requesterId: null,
        transition: { type: 'SELL_AUCTION', listingId: listing.id },
      });

      listing.status = AuctionListingStatus.SOLD_PENDING_CLAIM;
      listing.buyerCharacterId = input.buyerCharacterId;
      return manager.save(AuctionListing, listing);
    });
  }

  // ── Claim acheteur ───────────────────────────────────────────────────────

  async claimBuyer(buyerCharacterId: string, listingId: string): Promise<AuctionListing> {
    return this.dataSource.transaction(async (manager) => {
      const listing = await this.lockListing(manager, listingId);

      if (listing.status !== AuctionListingStatus.SOLD_PENDING_CLAIM) {
        throw new BadRequestException(`Listing is not pending buyer claim (status: ${listing.status})`);
      }
      if (listing.buyerCharacterId !== buyerCharacterId) {
        throw new BadRequestException('Only the buyer can claim this listing');
      }

      await this.itemTransfer.transfer(manager, listing.itemInstanceId, {
        requesterId: buyerCharacterId,
        transition: {
          type: 'CLAIM_BUYER',
          listingId: listing.id,
          buyerCharacterId,
        },
      });

      listing.status = AuctionListingStatus.SOLD_CLAIMED;
      return manager.save(AuctionListing, listing);
    });
  }

  // ── Claim vendeur (après annulation ou expiration) ────────────────────────

  async claimSeller(sellerCharacterId: string, listingId: string): Promise<AuctionListing> {
    return this.dataSource.transaction(async (manager) => {
      const listing = await this.lockListing(manager, listingId);

      if (listing.sellerCharacterId !== sellerCharacterId) {
        throw new BadRequestException('Only the seller can reclaim this listing');
      }
      if (
        listing.status !== AuctionListingStatus.CANCELLED_PENDING_CLAIM &&
        listing.status !== AuctionListingStatus.EXPIRED_PENDING_CLAIM
      ) {
        throw new BadRequestException(`Listing is not pending seller claim (status: ${listing.status})`);
      }

      await this.itemTransfer.transfer(manager, listing.itemInstanceId, {
        requesterId: sellerCharacterId,
        transition: {
          type: 'RETURN_TO_SELLER',
          listingId: listing.id,
          sellerCharacterId,
        },
      });

      const nextStatus =
        listing.status === AuctionListingStatus.CANCELLED_PENDING_CLAIM
          ? AuctionListingStatus.CANCELLED_CLAIMED
          : AuctionListingStatus.EXPIRED_CLAIMED;

      listing.status = nextStatus;
      return manager.save(AuctionListing, listing);
    });
  }

  // ── Expiration ───────────────────────────────────────────────────────────

  async processExpiredListings(now = new Date()): Promise<AuctionListing[]> {
    const expired = await this.listings.find({
      where: {
        status: AuctionListingStatus.LISTED,
        endsAt: LessThanOrEqual(now),
      },
    });

    const results: AuctionListing[] = [];

    for (const listing of expired) {
      try {
        const updated = await this.expireOneListing(listing.id);
        if (updated) results.push(updated);
      } catch {
        // Concurrent buy/cancel peut avoir déjà changé le statut — on continue le batch
      }
    }

    return results;
  }

  private async expireOneListing(listingId: string): Promise<AuctionListing | null> {
    return this.dataSource.transaction(async (manager) => {
      const listing = await this.lockListing(manager, listingId);

      // Idempotence : la liste peut avoir été achetée ou annulée entre le batch read et ici
      if (listing.status !== AuctionListingStatus.LISTED) return null;

      listing.status = AuctionListingStatus.EXPIRED_PENDING_CLAIM;
      return manager.save(AuctionListing, listing);
    });
  }

  // ── Helpers privés ────────────────────────────────────────────────────────

  private async lockListing(manager: EntityManager, listingId: string): Promise<AuctionListing> {
    const listing = await manager
      .getRepository(AuctionListing)
      .createQueryBuilder('al')
      .setLock('pessimistic_write')
      .where('al.id = :id', { id: listingId })
      .getOne();
    if (!listing) throw new NotFoundException(`AuctionListing ${listingId} not found`);
    return listing;
  }

  private assertOwner(instance: ItemInstance, characterId: string): void {
    if (instance.ownerId !== characterId) {
      throw new BadRequestException('Instance does not belong to this character');
    }
  }

  private assertInstanceAvailableForListing(instance: ItemInstance): void {
    if (instance.state !== ItemInstanceState.AVAILABLE) {
      throw new BadRequestException(
        `Instance cannot be listed (state: ${instance.state})`,
      );
    }
    if (instance.containerType !== ItemInstanceContainerType.INVENTORY) {
      throw new BadRequestException(
        `Instance is not in inventory (container: ${instance.containerType})`,
      );
    }
  }

  private assertPositivePrice(price: bigint): void {
    if (price <= 0n) {
      throw new BadRequestException('buyoutPriceBronze must be strictly positive');
    }
  }
}
