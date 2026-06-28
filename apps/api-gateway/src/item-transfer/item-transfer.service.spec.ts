import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../item-instances/entities/item-instance.entity';
import { ItemTransferService, TransferContext } from './item-transfer.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInstance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: "inst-1",
    itemId: "item-1",
    ownerType: "character",
    ownerId: "char-1",
    state: ItemInstanceState.AVAILABLE,
    containerType: ItemInstanceContainerType.INVENTORY,
    containerId: "char-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ItemInstance;
}

function makeManager(instance: ItemInstance | null) {
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(instance),
  };
  const manager = {
    getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn(() => qb) }),
    save: jest.fn().mockImplementation(async (_Entity: unknown, entity: unknown) => entity),
    _qb: qb,
  };
  return manager as unknown as jest.Mocked<EntityManager> & { _qb: typeof qb };
}

// ── Suite principale ──────────────────────────────────────────────────────────

describe("ItemTransferService", () => {
  let service: ItemTransferService;

  beforeEach(() => {
    service = new ItemTransferService();
  });

  // ── lockInstance ────────────────────────────────────────────────────────────

  it("leve NotFoundException si l instance est introuvable", async () => {
    const manager = makeManager(null);
    const context: TransferContext = {
      requesterId: "char-1",
      transition: { type: "EQUIP", characterId: "char-1" },
    };
    await expect(service.transfer(manager, "ghost-id", context)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("pose un lock pessimiste sur l instance", async () => {
    const instance = makeInstance();
    const manager = makeManager(instance);
    await service.transfer(manager, instance.id, {
      requesterId: "char-1",
      transition: { type: "EQUIP", characterId: "char-1" },
    });
    expect(manager._qb.setLock).toHaveBeenCalledWith("pessimistic_write");
  });

  // ── EQUIP ──────────────────────────────────────────────────────────────────

  describe("transition EQUIP", () => {
    it("transitionne AVAILABLE+INVENTORY → EQUIPPED+EQUIPMENT", async () => {
      const instance = makeInstance();
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "EQUIP", characterId: "char-1" },
      });
      expect(result.state).toBe(ItemInstanceState.EQUIPPED);
      expect(result.containerType).toBe(ItemInstanceContainerType.EQUIPMENT);
      expect(result.containerId).toBe("char-1");
    });

    it("refuse si owner incorrect", async () => {
      const instance = makeInstance({ ownerId: "other" });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "EQUIP", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != AVAILABLE", async () => {
      const instance = makeInstance({ state: ItemInstanceState.EQUIPPED });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "EQUIP", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerType != INVENTORY", async () => {
      const instance = makeInstance({ containerType: ItemInstanceContainerType.WORLD });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "EQUIP", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── UNEQUIP ────────────────────────────────────────────────────────────────

  describe("transition UNEQUIP", () => {
    it("transitionne EQUIPPED+EQUIPMENT → AVAILABLE+INVENTORY", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
        containerId: "char-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "UNEQUIP", characterId: "char-1" },
      });
      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("char-1");
    });

    it("refuse si owner incorrect", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
        ownerId: "other",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "UNEQUIP", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != EQUIPPED", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "UNEQUIP", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── DROP_TO_WORLD ──────────────────────────────────────────────────────────

  describe("transition DROP_TO_WORLD", () => {
    it("transitionne AVAILABLE+INVENTORY → IN_WORLD+WORLD avec worldItemId", async () => {
      const instance = makeInstance();
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "DROP_TO_WORLD", worldItemId: "wi-1" },
      });
      expect(result.state).toBe(ItemInstanceState.IN_WORLD);
      expect(result.containerType).toBe(ItemInstanceContainerType.WORLD);
      expect(result.containerId).toBe("wi-1");
    });

    it("refuse si instance EQUIPPED", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "DROP_TO_WORLD", worldItemId: "wi-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si instance deja IN_WORLD", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_WORLD,
        containerType: ItemInstanceContainerType.WORLD,
        containerId: "wi-old",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "DROP_TO_WORLD", worldItemId: "wi-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si owner incorrect", async () => {
      const instance = makeInstance({ ownerId: "other" });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "DROP_TO_WORLD", worldItemId: "wi-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── PICKUP_FROM_WORLD ──────────────────────────────────────────────────────

  describe("transition PICKUP_FROM_WORLD", () => {
    it("transitionne IN_WORLD+WORLD → AVAILABLE+INVENTORY avec characterId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_WORLD,
        containerType: ItemInstanceContainerType.WORLD,
        containerId: "wi-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "PICKUP_FROM_WORLD", worldItemId: "wi-1", characterId: "char-1" },
      });
      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("char-1");
    });

    it("refuse si owner incorrect", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_WORLD,
        containerType: ItemInstanceContainerType.WORLD,
        containerId: "wi-1",
        ownerId: "other",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "PICKUP_FROM_WORLD", worldItemId: "wi-1", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerId != worldItemId (mauvais WorldItem)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_WORLD,
        containerType: ItemInstanceContainerType.WORLD,
        containerId: "wi-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "PICKUP_FROM_WORLD", worldItemId: "wi-1", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != IN_WORLD", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.AVAILABLE,
        containerType: ItemInstanceContainerType.INVENTORY,
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "PICKUP_FROM_WORLD", worldItemId: "wi-1", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── ARCHIVE ────────────────────────────────────────────────────────────────

  describe("transition ARCHIVE", () => {
    it("transitionne IN_WORLD+WORLD → ARCHIVED+NONE+containerId null (requesterId null)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_WORLD,
        containerType: ItemInstanceContainerType.WORLD,
        containerId: "wi-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "ARCHIVE", worldItemId: "wi-1" },
      });
      expect(result.state).toBe(ItemInstanceState.ARCHIVED);
      expect(result.containerType).toBe(ItemInstanceContainerType.NONE);
      expect(result.containerId).toBeNull();
    });

    it("refuse si containerId != worldItemId (instance deja deplacee)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_WORLD,
        containerType: ItemInstanceContainerType.WORLD,
        containerId: "wi-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "ARCHIVE", worldItemId: "wi-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != IN_WORLD", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "ARCHIVE", worldItemId: "wi-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── Rollback propagation ───────────────────────────────────────────────────

  it("propage l erreur si manager.save leve une exception (rollback)", async () => {
    const instance = makeInstance();
    const manager = makeManager(instance);
    (manager.save as jest.Mock).mockRejectedValue(new Error("DB failure"));
    await expect(
      service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "EQUIP", characterId: "char-1" },
      })
    ).rejects.toThrow("DB failure");
  });

  // ── Double-transfer concurrent ─────────────────────────────────────────────

  it("refuse une double transition EQUIP concurrent (EQUIPPED n est plus AVAILABLE)", async () => {
    const instance = makeInstance({ state: ItemInstanceState.EQUIPPED, containerType: ItemInstanceContainerType.EQUIPMENT });
    const manager = makeManager(instance);
    await expect(
      service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "EQUIP", characterId: "char-1" },
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── LIST_FOR_AUCTION ───────────────────────────────────────────────────────

  describe("transition LIST_FOR_AUCTION", () => {
    it("transitionne AVAILABLE+INVENTORY → LISTED+AUCTION+listingId", async () => {
      const instance = makeInstance();
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "LIST_FOR_AUCTION", listingId: "listing-1" },
      });
      expect(result.state).toBe(ItemInstanceState.LISTED);
      expect(result.containerType).toBe(ItemInstanceContainerType.AUCTION);
      expect(result.containerId).toBe("listing-1");
    });

    it("refuse si owner incorrect", async () => {
      const instance = makeInstance({ ownerId: "other" });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "LIST_FOR_AUCTION", listingId: "listing-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != AVAILABLE", async () => {
      const instance = makeInstance({ state: ItemInstanceState.EQUIPPED, containerType: ItemInstanceContainerType.EQUIPMENT });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "LIST_FOR_AUCTION", listingId: "listing-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerType != INVENTORY", async () => {
      const instance = makeInstance({ containerType: ItemInstanceContainerType.EQUIPMENT });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "LIST_FOR_AUCTION", listingId: "listing-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── SELL_AUCTION ───────────────────────────────────────────────────────────

  describe("transition SELL_AUCTION", () => {
    it("transitionne LISTED+AUCTION → SOLD_PENDING_CLAIM+AUCTION+listingId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.LISTED,
        containerType: ItemInstanceContainerType.AUCTION,
        containerId: "listing-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "SELL_AUCTION", listingId: "listing-1" },
      });
      expect(result.state).toBe(ItemInstanceState.SOLD_PENDING_CLAIM);
      expect(result.containerType).toBe(ItemInstanceContainerType.AUCTION);
      expect(result.containerId).toBe("listing-1");
    });

    it("refuse si state != LISTED", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "SELL_AUCTION", listingId: "listing-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerId != listingId (double achat)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.LISTED,
        containerType: ItemInstanceContainerType.AUCTION,
        containerId: "listing-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "SELL_AUCTION", listingId: "listing-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── CLAIM_BUYER ────────────────────────────────────────────────────────────

  describe("transition CLAIM_BUYER", () => {
    it("transitionne SOLD_PENDING_CLAIM+AUCTION → AVAILABLE+INVENTORY+buyerCharacterId et change ownerId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.SOLD_PENDING_CLAIM,
        containerType: ItemInstanceContainerType.AUCTION,
        containerId: "listing-1",
        ownerId: "seller-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "buyer-1",
        transition: { type: "CLAIM_BUYER", listingId: "listing-1", buyerCharacterId: "buyer-1" },
      });
      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("buyer-1");
      expect(result.ownerId).toBe("buyer-1");
    });

    it("refuse si state != SOLD_PENDING_CLAIM", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.LISTED,
        containerType: ItemInstanceContainerType.AUCTION,
        containerId: "listing-1",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "buyer-1",
          transition: { type: "CLAIM_BUYER", listingId: "listing-1", buyerCharacterId: "buyer-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerId != listingId (double claim)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.SOLD_PENDING_CLAIM,
        containerType: ItemInstanceContainerType.AUCTION,
        containerId: "listing-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "buyer-1",
          transition: { type: "CLAIM_BUYER", listingId: "listing-1", buyerCharacterId: "buyer-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── RETURN_TO_SELLER ───────────────────────────────────────────────────────

  describe("transition RETURN_TO_SELLER", () => {
    it("transitionne LISTED+AUCTION → AVAILABLE+INVENTORY+sellerCharacterId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.LISTED,
        containerType: ItemInstanceContainerType.AUCTION,
        containerId: "listing-1",
        ownerId: "seller-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "RETURN_TO_SELLER", listingId: "listing-1", sellerCharacterId: "seller-1" },
      });
      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("seller-1");
      expect(result.ownerId).toBe("seller-1");
    });

    it("refuse si state != LISTED", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "RETURN_TO_SELLER", listingId: "listing-1", sellerCharacterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerId != listingId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.LISTED,
        containerType: ItemInstanceContainerType.AUCTION,
        containerId: "listing-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "RETURN_TO_SELLER", listingId: "listing-1", sellerCharacterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── STORE_BANK ─────────────────────────────────────────────────────────────

  describe("transition STORE_BANK", () => {
    it("transitionne AVAILABLE+INVENTORY → IN_BANK+BANK+characterId", async () => {
      const instance = makeInstance();
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "STORE_BANK", characterId: "char-1" },
      });
      expect(result.state).toBe(ItemInstanceState.IN_BANK);
      expect(result.containerType).toBe(ItemInstanceContainerType.BANK);
      expect(result.containerId).toBe("char-1");
    });

    it("refuse si owner incorrect", async () => {
      const instance = makeInstance({ ownerId: "other" });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "STORE_BANK", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != AVAILABLE (double depot)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "STORE_BANK", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerType != INVENTORY (objet equipe)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "STORE_BANK", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── WITHDRAW_BANK ──────────────────────────────────────────────────────────

  describe("transition WITHDRAW_BANK", () => {
    it("transitionne IN_BANK+BANK → AVAILABLE+INVENTORY+characterId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
        containerId: "char-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "WITHDRAW_BANK", characterId: "char-1" },
      });
      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("char-1");
    });

    it("refuse si owner incorrect", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
        containerId: "char-1",
        ownerId: "other",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "WITHDRAW_BANK", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != IN_BANK (double retrait)", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "WITHDRAW_BANK", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerId ne correspond pas au characterId (mauvais personnage)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
        containerId: "char-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "WITHDRAW_BANK", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
