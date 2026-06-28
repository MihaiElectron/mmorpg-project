import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from "../item-instances/entities/item-instance.entity";
import { Item, ObjectMode } from "../items/entities/item.entity";
import { ItemTransferService } from "../item-transfer/item-transfer.service";
import { EconomyService } from "../economy/economy.service";
import {
  AuctionListing,
  AuctionListingStatus,
  AUCTION_MAX_ACTIVE_LISTINGS,
} from "./entities/auction-listing.entity";
import { AuctionService } from "./auction.service";
import { Wallet } from "../economy/entities/wallet.entity";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(objectMode: ObjectMode = ObjectMode.INSTANCE): Item {
  return { id: "item-1", objectMode } as Item;
}

function makeInstance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: "inst-1",
    itemId: "item-1",
    ownerId: "seller-1",
    ownerType: "character",
    state: ItemInstanceState.AVAILABLE,
    containerType: ItemInstanceContainerType.INVENTORY,
    containerId: "seller-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ItemInstance;
}

function makeListing(overrides: Partial<AuctionListing> = {}): AuctionListing {
  return {
    id: "listing-1",
    sellerCharacterId: "seller-1",
    buyerCharacterId: null,
    itemInstanceId: "inst-1",
    itemId: "item-1",
    buyoutPriceBronze: "500",
    status: AuctionListingStatus.LISTED,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 86400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AuctionListing;
}

function makeWallet(id: string): Wallet {
  return { id, balanceBronze: "10000" } as Wallet;
}

function makeListingsRepo(listing: AuctionListing | null = null, count = 0) {
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(listing),
  };
  return {
    find: jest.fn().mockResolvedValue(listing ? [listing] : []),
    findOneBy: jest.fn().mockResolvedValue(listing),
    count: jest.fn().mockResolvedValue(count),
    create: jest.fn((_E: unknown, data: unknown) => ({ ...(data as object) })),
    save: jest.fn(async (_E: unknown, data: unknown) => ({ id: "listing-1", ...(data as object) })),
    createQueryBuilder: jest.fn(() => qb),
    _qb: qb,
  };
}

function makeManager(
  instance: ItemInstance | null,
  item: Item | null,
  listingsRepo: ReturnType<typeof makeListingsRepo>,
) {
  return {
    findOne: jest.fn(async (_Entity: unknown, opts: { where: { id: string } }) => {
      if (opts?.where?.id === instance?.id) return instance;
      if (opts?.where?.id === item?.id) return item;
      return null;
    }),
    getRepository: jest.fn().mockReturnValue(listingsRepo),
    create: jest.fn((_E: unknown, data: unknown) => ({ ...(data as object) })),
    save: jest.fn(async (_E: unknown, data: unknown) => ({ id: "listing-1", ...(data as object) })),
  } as unknown as EntityManager;
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("AuctionService", () => {
  let service: AuctionService;
  let listingsRepo: ReturnType<typeof makeListingsRepo>;
  let itemTransfer: jest.Mocked<Pick<ItemTransferService, "transfer">>;
  let economy: jest.Mocked<Pick<EconomyService, "getOrCreateWallet" | "transferWithinManager">>;
  let dataSource: { transaction: jest.Mock };

  function buildService(
    instance: ItemInstance | null,
    item: Item | null,
    listing: AuctionListing | null = null,
    activeListingsCount = 0,
  ) {
    listingsRepo = makeListingsRepo(listing, activeListingsCount);

    itemTransfer = {
      transfer: jest.fn().mockImplementation(async (_mgr, _id, ctx) => {
        const inst = instance!;
        if (ctx.transition.type === "LIST_FOR_AUCTION") {
          inst.state = ItemInstanceState.LISTED;
          inst.containerType = ItemInstanceContainerType.AUCTION;
          inst.containerId = ctx.transition.listingId;
        }
        return inst;
      }),
    };

    economy = {
      getOrCreateWallet: jest.fn().mockImplementation(async (_type, ownerId) =>
        makeWallet(ownerId),
      ),
      transferWithinManager: jest.fn().mockResolvedValue({}),
    };

    const managerFactory = () =>
      makeManager(instance, item, listingsRepo);

    dataSource = {
      transaction: jest.fn(async (fn: (mgr: EntityManager) => unknown) =>
        fn(managerFactory()),
      ),
    };

    service = new AuctionService(
      listingsRepo as unknown as Repository<AuctionListing>,
      {} as Repository<ItemInstance>,
      {} as Repository<Item>,
      dataSource as unknown as DataSource,
      itemTransfer as unknown as ItemTransferService,
      economy as unknown as EconomyService,
    );
  }

  // ── createListing ──────────────────────────────────────────────────────────

  describe("createListing", () => {
    it("cree une annonce et transitionne l instance vers LISTED+AUCTION", async () => {
      const instance = makeInstance();
      const item = makeItem();
      buildService(instance, item);

      const result = await service.createListing({
        sellerCharacterId: "seller-1",
        itemInstanceId: "inst-1",
        buyoutPriceBronze: 500n,
        durationHours: 24,
      });

      expect(result.status).toBe(AuctionListingStatus.LISTED);
      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({ transition: expect.objectContaining({ type: "LIST_FOR_AUCTION" }) }),
      );
    });

    it("refuse si prix nul ou negatif", async () => {
      buildService(makeInstance(), makeItem());
      await expect(
        service.createListing({
          sellerCharacterId: "seller-1",
          itemInstanceId: "inst-1",
          buyoutPriceBronze: 0n,
          durationHours: 24,
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance n appartient pas au vendeur", async () => {
      const instance = makeInstance({ ownerId: "other" });
      buildService(instance, makeItem());
      await expect(
        service.createListing({
          sellerCharacterId: "seller-1",
          itemInstanceId: "inst-1",
          buyoutPriceBronze: 100n,
          durationHours: 24,
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si item.objectMode !== INSTANCE (STACKABLE non listable)", async () => {
      buildService(makeInstance(), makeItem(ObjectMode.STACKABLE));
      await expect(
        service.createListing({
          sellerCharacterId: "seller-1",
          itemInstanceId: "inst-1",
          buyoutPriceBronze: 100n,
          durationHours: 24,
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si limite d annonces actives atteinte", async () => {
      buildService(makeInstance(), makeItem(), null, AUCTION_MAX_ACTIVE_LISTINGS);
      await expect(
        service.createListing({
          sellerCharacterId: "seller-1",
          itemInstanceId: "inst-1",
          buyoutPriceBronze: 100n,
          durationHours: 24,
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── cancelListing ──────────────────────────────────────────────────────────

  describe("cancelListing", () => {
    it("passe le statut a CANCELLED_PENDING_CLAIM", async () => {
      const listing = makeListing();
      buildService(makeInstance(), makeItem(), listing);

      const result = await service.cancelListing("seller-1", "listing-1");
      expect(result.status).toBe(AuctionListingStatus.CANCELLED_PENDING_CLAIM);
    });

    it("refuse si ce n est pas le vendeur", async () => {
      const listing = makeListing({ sellerCharacterId: "seller-1" });
      buildService(makeInstance(), makeItem(), listing);
      await expect(service.cancelListing("autre", "listing-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si statut != LISTED", async () => {
      const listing = makeListing({ status: AuctionListingStatus.SOLD_PENDING_CLAIM });
      buildService(makeInstance(), makeItem(), listing);
      await expect(service.cancelListing("seller-1", "listing-1")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── buyListing ─────────────────────────────────────────────────────────────

  describe("buyListing", () => {
    it("transitionne le statut a SOLD_PENDING_CLAIM et enregistre l acheteur", async () => {
      const listing = makeListing();
      buildService(makeInstance(), makeItem(), listing);

      const result = await service.buyListing({ buyerCharacterId: "buyer-1", listingId: "listing-1" });
      expect(result.status).toBe(AuctionListingStatus.SOLD_PENDING_CLAIM);
      expect(result.buyerCharacterId).toBe("buyer-1");
      expect(economy.transferWithinManager).toHaveBeenCalled();
    });

    it("refuse si l acheteur est le vendeur", async () => {
      const listing = makeListing({ sellerCharacterId: "buyer-1" });
      buildService(makeInstance(), makeItem(), listing);
      await expect(service.buyListing({ buyerCharacterId: "buyer-1", listingId: "listing-1" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si statut != LISTED (double achat)", async () => {
      const listing = makeListing({ status: AuctionListingStatus.SOLD_PENDING_CLAIM });
      buildService(makeInstance(), makeItem(), listing);
      await expect(service.buyListing({ buyerCharacterId: "buyer-1", listingId: "listing-1" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si annonce expiree", async () => {
      const listing = makeListing({ endsAt: new Date(Date.now() - 1000) });
      buildService(makeInstance(), makeItem(), listing);
      await expect(service.buyListing({ buyerCharacterId: "buyer-1", listingId: "listing-1" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("propage BadRequestException si solde insuffisant (economy.transferWithinManager leve)", async () => {
      const listing = makeListing();
      buildService(makeInstance(), makeItem(), listing);
      economy.transferWithinManager.mockRejectedValue(new BadRequestException("Solde insuffisant"));
      await expect(service.buyListing({ buyerCharacterId: "buyer-1", listingId: "listing-1" })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── claimBuyer ─────────────────────────────────────────────────────────────

  describe("claimBuyer", () => {
    it("passe le statut a SOLD_CLAIMED et appelle CLAIM_BUYER", async () => {
      const listing = makeListing({
        status: AuctionListingStatus.SOLD_PENDING_CLAIM,
        buyerCharacterId: "buyer-1",
      });
      buildService(makeInstance(), makeItem(), listing);

      const result = await service.claimBuyer("buyer-1", "listing-1");
      expect(result.status).toBe(AuctionListingStatus.SOLD_CLAIMED);
      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({ transition: expect.objectContaining({ type: "CLAIM_BUYER" }) }),
      );
    });

    it("refuse si ce n est pas l acheteur", async () => {
      const listing = makeListing({ status: AuctionListingStatus.SOLD_PENDING_CLAIM, buyerCharacterId: "buyer-1" });
      buildService(makeInstance(), makeItem(), listing);
      await expect(service.claimBuyer("autre", "listing-1")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── claimSeller ────────────────────────────────────────────────────────────

  describe("claimSeller", () => {
    it("retourne CANCELLED_CLAIMED apres annulation", async () => {
      const listing = makeListing({ status: AuctionListingStatus.CANCELLED_PENDING_CLAIM });
      buildService(makeInstance(), makeItem(), listing);

      const result = await service.claimSeller("seller-1", "listing-1");
      expect(result.status).toBe(AuctionListingStatus.CANCELLED_CLAIMED);
    });

    it("retourne EXPIRED_CLAIMED apres expiration", async () => {
      const listing = makeListing({ status: AuctionListingStatus.EXPIRED_PENDING_CLAIM });
      buildService(makeInstance(), makeItem(), listing);

      const result = await service.claimSeller("seller-1", "listing-1");
      expect(result.status).toBe(AuctionListingStatus.EXPIRED_CLAIMED);
    });

    it("refuse si ce n est pas le vendeur", async () => {
      const listing = makeListing({ status: AuctionListingStatus.CANCELLED_PENDING_CLAIM });
      buildService(makeInstance(), makeItem(), listing);
      await expect(service.claimSeller("autre", "listing-1")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── processExpiredListings ────────────────────────────────────────────────

  describe("processExpiredListings", () => {
    it("passe les annonces LISTED expirees a EXPIRED_PENDING_CLAIM", async () => {
      const listing = makeListing({ endsAt: new Date(Date.now() - 1000) });
      buildService(makeInstance(), makeItem(), listing);
      listingsRepo.find.mockResolvedValue([listing]);

      const results = await service.processExpiredListings();
      expect(results.length).toBe(1);
      expect(results[0].status).toBe(AuctionListingStatus.EXPIRED_PENDING_CLAIM);
    });

    it("ignore les annonces deja achetees entre le batch read et le verrou", async () => {
      const listing = makeListing({ status: AuctionListingStatus.SOLD_PENDING_CLAIM });
      buildService(makeInstance(), makeItem(), listing);
      listingsRepo.find.mockResolvedValue([listing]);

      const results = await service.processExpiredListings();
      expect(results.length).toBe(0);
    });
  });

  // ── lockListing (NotFoundException) ───────────────────────────────────────

  it("leve NotFoundException si listing introuvable", async () => {
    buildService(makeInstance(), makeItem(), null);
    await expect(service.cancelListing("seller-1", "ghost-id")).rejects.toBeInstanceOf(NotFoundException);
  });
});
