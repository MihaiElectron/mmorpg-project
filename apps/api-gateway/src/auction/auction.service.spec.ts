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
  let itemTransfer: jest.Mocked<Pick<ItemTransferService, "transfer" | "createLot">>;
  let economy: jest.Mocked<Pick<EconomyService, "getOrCreateWallet" | "transferWithinManager">>;
  let mailService: { sendSystemMailWithinManager: jest.Mock };
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
      createLot: jest.fn().mockResolvedValue({ id: "lot-1", itemId: "item-1", quantity: 100 }),
    };

    economy = {
      getOrCreateWallet: jest.fn().mockImplementation(async (_type, ownerId) =>
        makeWallet(ownerId),
      ),
      transferWithinManager: jest.fn().mockResolvedValue({}),
    };

    mailService = {
      sendSystemMailWithinManager: jest.fn().mockResolvedValue({ id: "mail-1" }),
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
      mailService as any,
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

    it("refuse si item.objectMode !== INSTANCE quand itemInstanceId est fourni", async () => {
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
    it("passe le statut a CANCELLED_CLAIMED et cree un courrier vendeur", async () => {
      const listing = makeListing();
      buildService(makeInstance(), makeItem(), listing);

      const result = await service.cancelListing("seller-1", "listing-1");
      expect(result.status).toBe(AuctionListingStatus.CANCELLED_CLAIMED);
      expect(mailService.sendSystemMailWithinManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientCharacterId: "seller-1", attachedItemInstanceId: "inst-1" }),
      );
    });

    it("refuse si ce n est pas le vendeur", async () => {
      const listing = makeListing({ sellerCharacterId: "seller-1" });
      buildService(makeInstance(), makeItem(), listing);
      await expect(service.cancelListing("autre", "listing-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si statut != LISTED", async () => {
      const listing = makeListing({ status: AuctionListingStatus.SOLD_CLAIMED });
      buildService(makeInstance(), makeItem(), listing);
      await expect(service.cancelListing("seller-1", "listing-1")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── buyListing ─────────────────────────────────────────────────────────────

  describe("buyListing", () => {
    it("transitionne le statut a SOLD_CLAIMED, cree 2 mails systeme et enregistre l acheteur", async () => {
      const listing = makeListing();
      buildService(makeInstance(), makeItem(), listing);

      const result = await service.buyListing({ buyerCharacterId: "buyer-1", listingId: "listing-1" });
      expect(result.status).toBe(AuctionListingStatus.SOLD_CLAIMED);
      expect(result.buyerCharacterId).toBe("buyer-1");
      expect(economy.transferWithinManager).toHaveBeenCalled();
      expect(mailService.sendSystemMailWithinManager).toHaveBeenCalledTimes(2);
      expect(mailService.sendSystemMailWithinManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientCharacterId: "buyer-1", attachedItemInstanceId: "inst-1" }),
      );
      expect(mailService.sendSystemMailWithinManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientCharacterId: "seller-1", attachedAmountBronze: "500" }),
      );
    });

    it("cree le mail acheteur avant la transition AUCTION_TO_MAIL", async () => {
      const listing = makeListing();
      buildService(makeInstance(), makeItem(), listing);

      const callOrder: string[] = [];
      mailService.sendSystemMailWithinManager.mockImplementation(async () => {
        callOrder.push("mail");
        return { id: "mail-1" };
      });
      itemTransfer.transfer.mockImplementation(async (_mgr, _id, ctx) => {
        callOrder.push(ctx.transition.type as string);
        return makeInstance();
      });

      await service.buyListing({ buyerCharacterId: "buyer-1", listingId: "listing-1" });

      expect(callOrder[0]).toBe("mail");
      expect(callOrder[1]).toBe("AUCTION_TO_MAIL");
    });

    it("refuse si l acheteur est le vendeur", async () => {
      const listing = makeListing({ sellerCharacterId: "buyer-1" });
      buildService(makeInstance(), makeItem(), listing);
      await expect(service.buyListing({ buyerCharacterId: "buyer-1", listingId: "listing-1" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si statut != LISTED (double achat)", async () => {
      const listing = makeListing({ status: AuctionListingStatus.SOLD_CLAIMED });
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

  // ── processExpiredListings ────────────────────────────────────────────────

  describe("processExpiredListings", () => {
    it("passe les annonces LISTED expirees a EXPIRED_CLAIMED et cree un courrier vendeur", async () => {
      const listing = makeListing({ endsAt: new Date(Date.now() - 1000) });
      buildService(makeInstance(), makeItem(), listing);
      listingsRepo.find.mockResolvedValue([listing]);

      const results = await service.processExpiredListings();
      expect(results.length).toBe(1);
      expect(results[0].status).toBe(AuctionListingStatus.EXPIRED_CLAIMED);
      expect(mailService.sendSystemMailWithinManager).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ recipientCharacterId: "seller-1", attachedItemInstanceId: "inst-1" }),
      );
    });

    it("ignore les annonces deja achetees entre le batch read et le verrou", async () => {
      const listing = makeListing({ status: AuctionListingStatus.SOLD_CLAIMED });
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

  // ── createListing — branche STACKABLE ────────────────────────────────────

  describe("createListing — STACKABLE", () => {
    it("cree un LOT et un AuctionListing pour un STACKABLE", async () => {
      const stackableItem = makeItem(ObjectMode.STACKABLE);
      buildService(null, stackableItem);

      const result = await service.createListing({
        sellerCharacterId: "seller-1",
        itemId: "item-1",
        quantity: 100,
        buyoutPriceBronze: 500n,
        durationHours: 24,
      });

      expect(itemTransfer.createLot).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          itemId: "item-1",
          quantity: 100,
          sellerCharacterId: "seller-1",
        }),
      );
      expect(result.status).toBe(AuctionListingStatus.LISTED);
      expect(result.itemInstanceId).toBe("lot-1");
    });

    it("refuse si quantity absent ou 0 pour STACKABLE", async () => {
      buildService(null, makeItem(ObjectMode.STACKABLE));
      await expect(
        service.createListing({
          sellerCharacterId: "seller-1",
          itemId: "item-1",
          quantity: 0,
          buyoutPriceBronze: 100n,
          durationHours: 24,
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si item non STACKABLE dans la branche STACKABLE", async () => {
      buildService(null, makeItem(ObjectMode.INSTANCE));
      await expect(
        service.createListing({
          sellerCharacterId: "seller-1",
          itemId: "item-1",
          quantity: 10,
          buyoutPriceBronze: 100n,
          durationHours: 24,
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si ni itemInstanceId ni itemId+quantity ne sont fournis", async () => {
      buildService(makeInstance(), makeItem());
      await expect(
        service.createListing({
          sellerCharacterId: "seller-1",
          buyoutPriceBronze: 100n,
          durationHours: 24,
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
