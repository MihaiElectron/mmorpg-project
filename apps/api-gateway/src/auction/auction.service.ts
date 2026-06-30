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
import { MailService } from '../mail/mail.service';

export interface AuctionListingDto {
  id: string;
  itemId: string;
  itemName: string;
  itemImage: string;
  buyoutPriceBronze: string;
  status: AuctionListingStatus;
  sellerCharacterId: string;
  buyerCharacterId: string | null;
  endsAt: Date;
  createdAt: Date;
}

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
    private readonly mailService: MailService,
  ) {}

  // ── Lecture ──────────────────────────────────────────────────────────────

  async getActiveListings(): Promise<AuctionListingDto[]> {
    const rows = await this.listings.find({
      where: { status: AuctionListingStatus.LISTED },
      order: { createdAt: 'DESC' },
    });
    return this.enrichListings(rows);
  }

  async getSellerListings(sellerCharacterId: string): Promise<AuctionListingDto[]> {
    const rows = await this.listings.find({
      where: { sellerCharacterId },
      order: { createdAt: 'DESC' },
    });
    return this.enrichListings(rows);
  }

  async getBuyerPendingListings(buyerCharacterId: string): Promise<AuctionListingDto[]> {
    const rows = await this.listings.find({
      where: { buyerCharacterId, status: AuctionListingStatus.SOLD_PENDING_CLAIM },
      order: { updatedAt: 'DESC' },
    });
    return this.enrichListings(rows);
  }

  private async enrichListings(rows: AuctionListing[]): Promise<AuctionListingDto[]> {
    if (rows.length === 0) return [];
    const itemIds = [...new Set(rows.map((r) => r.itemId))];
    const items = await this.items.findByIds(itemIds);
    const itemMap = new Map(items.map((i) => [i.id, i]));
    return rows.map((r) => {
      const item = itemMap.get(r.itemId);
      return {
        id: r.id,
        itemId: r.itemId,
        itemName: item?.name ?? r.itemId,
        itemImage: item?.image ?? '',
        buyoutPriceBronze: r.buyoutPriceBronze,
        status: r.status,
        sellerCharacterId: r.sellerCharacterId,
        buyerCharacterId: r.buyerCharacterId,
        endsAt: r.endsAt,
        createdAt: r.createdAt,
      };
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

      // Courrier système : l'objet est livré dans la boîte aux lettres du vendeur
      const sellerMail = await this.mailService.sendSystemMailWithinManager(manager, {
        recipientCharacterId: listing.sellerCharacterId,
        subject: 'Annonce annulée — objet retourné',
        body: 'Votre annonce a été annulée. Votre objet vous a été retourné par courrier.',
        attachedItemInstanceId: listing.itemInstanceId,
      });

      await this.itemTransfer.transfer(manager, listing.itemInstanceId, {
        requesterId: null,
        transition: { type: 'AUCTION_TO_MAIL', listingId: listing.id, mailId: sellerMail.id },
      });

      listing.status = AuctionListingStatus.CANCELLED_CLAIMED;
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

    const [buyerWallet, escrowWallet] = await Promise.all([
      this.economy.getOrCreateWallet('character', input.buyerCharacterId),
      this.economy.getOrCreateWallet('system', 'auction_escrow'),
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

      // Verrou 2 : acheteur → escrow
      await this.economy.transferWithinManager(manager, {
        type: TransactionType.AUCTION_BUY,
        sourceWalletId: buyerWallet.id,
        destinationWalletId: escrowWallet.id,
        amountBronze: price,
        correlationId: listing.id,
      });

      // Mail acheteur (objet) — créé en premier pour obtenir son id
      const buyerMail = await this.mailService.sendSystemMailWithinManager(manager, {
        recipientCharacterId: input.buyerCharacterId,
        subject: 'Achat effectué',
        body: 'Votre achat est disponible. Réclamez votre objet dans votre boîte aux lettres.',
        attachedItemInstanceId: listing.itemInstanceId,
      });

      // Verrou 3 : ItemInstance LISTED+AUCTION → IN_MAIL+MAIL(buyerMail)
      await this.itemTransfer.transfer(manager, listing.itemInstanceId, {
        requesterId: null,
        transition: { type: 'AUCTION_TO_MAIL', listingId: listing.id, mailId: buyerMail.id },
      });

      // Mail vendeur (argent depuis escrow)
      await this.mailService.sendSystemMailWithinManager(manager, {
        recipientCharacterId: listing.sellerCharacterId,
        subject: 'Revenu de vente',
        body: 'Votre objet a été vendu. Réclamez votre revenu dans votre boîte aux lettres.',
        attachedAmountBronze: price.toString(),
      });

      listing.status = AuctionListingStatus.SOLD_CLAIMED;
      listing.buyerCharacterId = input.buyerCharacterId;
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

      // Objet retourné au vendeur via courrier système
      const sellerMail = await this.mailService.sendSystemMailWithinManager(manager, {
        recipientCharacterId: listing.sellerCharacterId,
        subject: 'Annonce expirée — objet retourné',
        body: 'Votre annonce a expiré. Votre objet vous a été retourné par courrier.',
        attachedItemInstanceId: listing.itemInstanceId,
      });

      await this.itemTransfer.transfer(manager, listing.itemInstanceId, {
        requesterId: null,
        transition: { type: 'AUCTION_TO_MAIL', listingId: listing.id, mailId: sellerMail.id },
      });

      listing.status = AuctionListingStatus.EXPIRED_CLAIMED;
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
