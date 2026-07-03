import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
  ItemInstanceType,
} from '../item-instances/entities/item-instance.entity';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
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
    instanceType: ItemInstanceType.NORMAL,
    quantity: null,
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

// Manager pour createLot (findOne item + getRepository Inventory)
function makeCreateLotManager(item: Item | null, inventory: Inventory | null) {
  const invQb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(inventory),
  };
  return {
    findOne: jest.fn().mockResolvedValue(item),
    getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn(() => invQb) }),
    create: jest.fn((_E: unknown, data: unknown) => ({ ...(data as object) })),
    save: jest.fn().mockImplementation(async (_E: unknown, entity: unknown) => ({
      id: "lot-uuid",
      ...(entity as object),
    })),
    _invQb: invQb,
  } as unknown as EntityManager & { _invQb: typeof invQb };
}

// Manager pour CLAIM_MAIL LOT (lockInstance via ItemInstance repo, puis Inventory repo)
function makeClaimLotManager(lotInstance: ItemInstance, existingInventory: Inventory | null) {
  const instanceQb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(lotInstance),
  };
  const invQb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(existingInventory),
  };
  return {
    getRepository: jest.fn().mockImplementation((Entity: unknown) => {
      if (Entity === Inventory) return { createQueryBuilder: jest.fn(() => invQb) };
      return { createQueryBuilder: jest.fn(() => instanceQb) };
    }),
    create: jest.fn((_E: unknown, data: unknown) => ({ ...(data as object) })),
    save: jest.fn().mockImplementation(async (_E: unknown, entity: unknown) => entity),
    _instanceQb: instanceQb,
    _invQb: invQb,
  } as unknown as EntityManager & { _instanceQb: typeof instanceQb; _invQb: typeof invQb };
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

  // ── Cycle equip → unequip → equip (repro bug earring) ────────────────────────

  describe("cycle equip -> unequip -> equip", () => {
    it("earring : equip puis unequip repasse AVAILABLE, la re-equip ne crash pas", async () => {
      // Repro du bug "state should be AVAILABLE but is EQUIPPED" :
      // apres un unequip correct, l'instance doit etre AVAILABLE/INVENTORY,
      // sinon la seconde equip echoue.
      const instance = makeInstance({
        id: "earring-inst",
        ownerId: "char-1",
        state: ItemInstanceState.AVAILABLE,
        containerType: ItemInstanceContainerType.INVENTORY,
        containerId: "char-1",
      });
      const manager = makeManager(instance);

      // 1) equip
      await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "EQUIP", characterId: "char-1" },
      });
      expect(instance.state).toBe(ItemInstanceState.EQUIPPED);
      expect(instance.containerType).toBe(ItemInstanceContainerType.EQUIPMENT);

      // 2) unequip -> doit revenir AVAILABLE/INVENTORY
      await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "UNEQUIP", characterId: "char-1" },
      });
      expect(instance.state).toBe(ItemInstanceState.AVAILABLE);
      expect(instance.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(instance.containerId).toBe("char-1");

      // 3) re-equip -> ne doit PAS lever "Expected state AVAILABLE, got EQUIPPED"
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "EQUIP", characterId: "char-1" },
        }),
      ).resolves.toBeDefined();
      expect(instance.state).toBe(ItemInstanceState.EQUIPPED);
    });
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

    it("refuse si instanceType est LOT", async () => {
      const instance = makeInstance({ instanceType: ItemInstanceType.LOT });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "EQUIP", characterId: "char-1" },
        })
      ).rejects.toThrow("Cannot equip a LOT item instance");
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

  // ── SEND_MAIL ──────────────────────────────────────────────────────────────

  describe("transition SEND_MAIL", () => {
    it("transitionne AVAILABLE+INVENTORY → IN_MAIL+MAIL+mailId", async () => {
      const instance = makeInstance();
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "SEND_MAIL", mailId: "mail-1" },
      });
      expect(result.state).toBe(ItemInstanceState.IN_MAIL);
      expect(result.containerType).toBe(ItemInstanceContainerType.MAIL);
      expect(result.containerId).toBe("mail-1");
      expect(result.ownerId).toBe("char-1");
    });

    it("refuse si owner incorrect", async () => {
      const instance = makeInstance({ ownerId: "other" });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "SEND_MAIL", mailId: "mail-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != AVAILABLE (objet deja en transit)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_MAIL,
        containerType: ItemInstanceContainerType.MAIL,
        containerId: "mail-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "SEND_MAIL", mailId: "mail-1" },
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
          transition: { type: "SEND_MAIL", mailId: "mail-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── CLAIM_MAIL ─────────────────────────────────────────────────────────────

  describe("transition CLAIM_MAIL", () => {
    it("transitionne IN_MAIL+MAIL → AVAILABLE+INVENTORY+recipientId et change ownerId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_MAIL,
        containerType: ItemInstanceContainerType.MAIL,
        containerId: "mail-1",
        ownerId: "sender-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "CLAIM_MAIL", mailId: "mail-1", recipientCharacterId: "recipient-1" },
      });
      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("recipient-1");
      expect(result.ownerId).toBe("recipient-1");
    });

    it("refuse si state != IN_MAIL (double claim)", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "CLAIM_MAIL", mailId: "mail-1", recipientCharacterId: "recipient-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerId != mailId (mauvais message)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_MAIL,
        containerType: ItemInstanceContainerType.MAIL,
        containerId: "mail-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "CLAIM_MAIL", mailId: "mail-1", recipientCharacterId: "recipient-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── STORE_GUILD ────────────────────────────────────────────────────────────

  describe("transition STORE_GUILD", () => {
    it("transitionne AVAILABLE+INVENTORY → IN_GUILD_STORAGE+GUILD_STORAGE+guildId", async () => {
      const instance = makeInstance();
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "STORE_GUILD", guildId: "guild-1" },
      });
      expect(result.state).toBe(ItemInstanceState.IN_GUILD_STORAGE);
      expect(result.containerType).toBe(ItemInstanceContainerType.GUILD_STORAGE);
      expect(result.containerId).toBe("guild-1");
      expect(result.ownerId).toBe("char-1");
    });

    it("refuse si le requesterId ne correspond pas au proprietaire", async () => {
      const instance = makeInstance({ ownerId: "char-1" });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "autre",
          transition: { type: "STORE_GUILD", guildId: "guild-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != AVAILABLE (double depot)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_GUILD_STORAGE,
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "STORE_GUILD", guildId: "guild-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerType != INVENTORY", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.AVAILABLE,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "STORE_GUILD", guildId: "guild-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── WITHDRAW_GUILD ─────────────────────────────────────────────────────────

  describe("transition WITHDRAW_GUILD", () => {
    it("transitionne IN_GUILD_STORAGE+GUILD_STORAGE → AVAILABLE+INVENTORY+characterId et change ownerId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_GUILD_STORAGE,
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
        containerId: "guild-1",
        ownerId: "char-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "WITHDRAW_GUILD", guildId: "guild-1", characterId: "char-2" },
      });
      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("char-2");
      expect(result.ownerId).toBe("char-2");
    });

    it("refuse si state != IN_GUILD_STORAGE", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "WITHDRAW_GUILD", guildId: "guild-1", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerId != guildId (mauvaise guilde)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_GUILD_STORAGE,
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
        containerId: "guild-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "WITHDRAW_GUILD", guildId: "guild-1", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── STORE_HOUSE ────────────────────────────────────────────────────────────

  describe("transition STORE_HOUSE", () => {
    it("transitionne AVAILABLE+INVENTORY → IN_HOUSING+HOUSING+houseId", async () => {
      const instance = makeInstance();
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "STORE_HOUSE", houseId: "house-1" },
      });
      expect(result.state).toBe(ItemInstanceState.IN_HOUSING);
      expect(result.containerType).toBe(ItemInstanceContainerType.HOUSING);
      expect(result.containerId).toBe("house-1");
      expect(result.ownerId).toBe("char-1");
    });

    it("refuse si requesterId ne correspond pas au proprietaire", async () => {
      const instance = makeInstance({ ownerId: "char-1" });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "autre",
          transition: { type: "STORE_HOUSE", houseId: "house-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != AVAILABLE (double depot)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_HOUSING,
        containerType: ItemInstanceContainerType.HOUSING,
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "STORE_HOUSE", houseId: "house-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerType != INVENTORY", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.AVAILABLE,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "STORE_HOUSE", houseId: "house-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── WITHDRAW_HOUSE ─────────────────────────────────────────────────────────

  describe("transition WITHDRAW_HOUSE", () => {
    it("transitionne IN_HOUSING+HOUSING → AVAILABLE+INVENTORY+characterId et change ownerId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_HOUSING,
        containerType: ItemInstanceContainerType.HOUSING,
        containerId: "house-1",
        ownerId: "char-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "WITHDRAW_HOUSE", houseId: "house-1", characterId: "char-2" },
      });
      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("char-2");
      expect(result.ownerId).toBe("char-2");
    });

    it("refuse si state != IN_HOUSING", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "WITHDRAW_HOUSE", houseId: "house-1", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerId != houseId (mauvaise maison)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_HOUSING,
        containerType: ItemInstanceContainerType.HOUSING,
        containerId: "house-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "WITHDRAW_HOUSE", houseId: "house-1", characterId: "char-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── TRADE_LOCK ─────────────────────────────────────────────────────────────

  describe("transition TRADE_LOCK", () => {
    it("transitionne AVAILABLE+INVENTORY → IN_TRADE+TRADE+tradeId, ownerId inchange", async () => {
      const instance = makeInstance();
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: "char-1",
        transition: { type: "TRADE_LOCK", tradeSessionId: "trade-1" },
      });
      expect(result.state).toBe(ItemInstanceState.IN_TRADE);
      expect(result.containerType).toBe(ItemInstanceContainerType.TRADE);
      expect(result.containerId).toBe("trade-1");
      expect(result.ownerId).toBe("char-1");
    });

    it("refuse si requesterId ne correspond pas au proprietaire", async () => {
      const instance = makeInstance({ ownerId: "char-1" });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "autre",
          transition: { type: "TRADE_LOCK", tradeSessionId: "trade-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si state != AVAILABLE", async () => {
      const instance = makeInstance({ state: ItemInstanceState.IN_TRADE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "TRADE_LOCK", tradeSessionId: "trade-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerType != INVENTORY", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.AVAILABLE,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: "char-1",
          transition: { type: "TRADE_LOCK", tradeSessionId: "trade-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── TRADE_COMMIT ───────────────────────────────────────────────────────────

  describe("transition TRADE_COMMIT", () => {
    it("transitionne IN_TRADE+TRADE → AVAILABLE+INVENTORY+recipient, change ownerId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_TRADE,
        containerType: ItemInstanceContainerType.TRADE,
        containerId: "trade-1",
        ownerId: "char-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "TRADE_COMMIT", tradeSessionId: "trade-1", recipientCharacterId: "char-2" },
      });
      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("char-2");
      expect(result.ownerId).toBe("char-2");
    });

    it("refuse si state != IN_TRADE", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "TRADE_COMMIT", tradeSessionId: "trade-1", recipientCharacterId: "char-2" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerId != tradeSessionId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_TRADE,
        containerType: ItemInstanceContainerType.TRADE,
        containerId: "trade-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "TRADE_COMMIT", tradeSessionId: "trade-1", recipientCharacterId: "char-2" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── TRADE_CANCEL ───────────────────────────────────────────────────────────

  describe("transition TRADE_CANCEL", () => {
    it("retourne l instance a son proprietaire (containerId = ownerId)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_TRADE,
        containerType: ItemInstanceContainerType.TRADE,
        containerId: "trade-1",
        ownerId: "char-1",
      });
      const manager = makeManager(instance);
      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "TRADE_CANCEL", tradeSessionId: "trade-1" },
      });
      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("char-1");
      expect(result.ownerId).toBe("char-1");
    });

    it("refuse si state != IN_TRADE", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "TRADE_CANCEL", tradeSessionId: "trade-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si containerId != tradeSessionId", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_TRADE,
        containerType: ItemInstanceContainerType.TRADE,
        containerId: "trade-autre",
      });
      const manager = makeManager(instance);
      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "TRADE_CANCEL", tradeSessionId: "trade-1" },
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── createLot ──────────────────────────────────────────────────────────────

  describe("createLot()", () => {
    it("cree un LOT et decremente l Inventory existante", async () => {
      const item = { id: "item-1", objectMode: ObjectMode.STACKABLE } as Item;
      const inventory = { id: "inv-1", quantity: 200, character: { id: "char-1" }, item: { id: "item-1" } } as unknown as Inventory;
      const manager = makeCreateLotManager(item, inventory);

      const result = await service.createLot(manager as unknown as EntityManager, {
        itemId: "item-1",
        quantity: 100,
        listingId: "listing-1",
        sellerCharacterId: "char-1",
      });

      expect(manager.save).toHaveBeenCalledTimes(2);
      expect(inventory.quantity).toBe(100);
      expect(result).toMatchObject({
        instanceType: ItemInstanceType.LOT,
        quantity: 100,
        itemId: "item-1",
        containerId: "listing-1",
      });
    });

    it("refuse si item introuvable", async () => {
      const manager = makeCreateLotManager(null, null);
      await expect(
        service.createLot(manager as unknown as EntityManager, {
          itemId: "ghost-item",
          quantity: 10,
          listingId: "listing-1",
          sellerCharacterId: "char-1",
        })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuse si item non STACKABLE", async () => {
      const item = { id: "item-1", objectMode: ObjectMode.INSTANCE } as Item;
      const manager = makeCreateLotManager(item, null);
      await expect(
        service.createLot(manager as unknown as EntityManager, {
          itemId: "item-1",
          quantity: 10,
          listingId: "listing-1",
          sellerCharacterId: "char-1",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si Inventory absente", async () => {
      const item = { id: "item-1", objectMode: ObjectMode.STACKABLE } as Item;
      const manager = makeCreateLotManager(item, null);
      await expect(
        service.createLot(manager as unknown as EntityManager, {
          itemId: "item-1",
          quantity: 10,
          listingId: "listing-1",
          sellerCharacterId: "char-1",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si Inventory insuffisante", async () => {
      const item = { id: "item-1", objectMode: ObjectMode.STACKABLE } as Item;
      const inventory = { id: "inv-1", quantity: 5 } as unknown as Inventory;
      const manager = makeCreateLotManager(item, inventory);
      await expect(
        service.createLot(manager as unknown as EntityManager, {
          itemId: "item-1",
          quantity: 10,
          listingId: "listing-1",
          sellerCharacterId: "char-1",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── CLAIM_MAIL LOT ─────────────────────────────────────────────────────────

  describe("transition CLAIM_MAIL — branche LOT", () => {
    it("fusionne la quantite dans l Inventory existante et detruit le LOT", async () => {
      const lot = makeInstance({
        id: "lot-1",
        instanceType: ItemInstanceType.LOT,
        quantity: 100,
        itemId: "item-1",
        state: ItemInstanceState.IN_MAIL,
        containerType: ItemInstanceContainerType.MAIL,
        containerId: "mail-1",
        ownerId: "seller-1",
      });
      const existingInventory = { id: "inv-1", quantity: 50 } as unknown as Inventory;
      const manager = makeClaimLotManager(lot, existingInventory);

      const result = await service.transfer(manager as unknown as EntityManager, "lot-1", {
        requesterId: null,
        transition: { type: "CLAIM_MAIL", mailId: "mail-1", recipientCharacterId: "buyer-1" },
      });

      expect(existingInventory.quantity).toBe(150);
      expect(result.state).toBe(ItemInstanceState.DESTROYED);
      expect(result.containerType).toBe(ItemInstanceContainerType.NONE);
      expect(result.containerId).toBeNull();
    });

    it("cree une nouvelle ligne Inventory si absente et detruit le LOT", async () => {
      const lot = makeInstance({
        id: "lot-1",
        instanceType: ItemInstanceType.LOT,
        quantity: 50,
        itemId: "item-1",
        state: ItemInstanceState.IN_MAIL,
        containerType: ItemInstanceContainerType.MAIL,
        containerId: "mail-1",
      });
      const manager = makeClaimLotManager(lot, null);

      const result = await service.transfer(manager as unknown as EntityManager, "lot-1", {
        requesterId: null,
        transition: { type: "CLAIM_MAIL", mailId: "mail-1", recipientCharacterId: "buyer-1" },
      });

      expect(manager.create).toHaveBeenCalledWith(
        Inventory,
        expect.objectContaining({ quantity: 50 }),
      );
      expect(result.state).toBe(ItemInstanceState.DESTROYED);
    });

    it("n altere pas le comportement NORMAL (AVAILABLE + INVENTORY)", async () => {
      const instance = makeInstance({
        instanceType: ItemInstanceType.NORMAL,
        state: ItemInstanceState.IN_MAIL,
        containerType: ItemInstanceContainerType.MAIL,
        containerId: "mail-1",
        ownerId: "sender-1",
      });
      const manager = makeManager(instance);

      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "CLAIM_MAIL", mailId: "mail-1", recipientCharacterId: "recipient-1" },
      });

      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.ownerId).toBe("recipient-1");
    });
  });

  // ── ADMIN_DESTROY ────────────────────────────────────────────────────────────

  describe("transition ADMIN_DESTROY", () => {
    it("marque AVAILABLE → DESTROYED + containerType NONE", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const manager = makeManager(instance);

      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "ADMIN_DESTROY" },
      });

      expect(result.state).toBe(ItemInstanceState.DESTROYED);
      expect(result.containerType).toBe(ItemInstanceContainerType.NONE);
      expect(result.containerId).toBeNull();
    });

    it("refuse de detruire une instance EQUIPPED", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const manager = makeManager(instance);

      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "ADMIN_DESTROY" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse de detruire une instance LISTED (auction)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.LISTED,
        containerType: ItemInstanceContainerType.AUCTION,
      });
      const manager = makeManager(instance);

      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "ADMIN_DESTROY" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse de detruire une instance IN_MAIL", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_MAIL,
        containerType: ItemInstanceContainerType.MAIL,
      });
      const manager = makeManager(instance);

      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "ADMIN_DESTROY" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse de detruire une instance deja DESTROYED", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.DESTROYED,
        containerType: ItemInstanceContainerType.NONE,
      });
      const manager = makeManager(instance);

      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "ADMIN_DESTROY" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── REPAIR_ORPHAN_EQUIPPED ───────────────────────────────────────────────────

  describe("transition REPAIR_ORPHAN_EQUIPPED", () => {
    // Manager avec lock (createQueryBuilder) + count CharacterEquipment configurable.
    function makeRepairManager(instance: ItemInstance, equipCount: number) {
      const qb = {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(instance),
      };
      const manager = {
        getRepository: jest.fn().mockReturnValue({
          createQueryBuilder: jest.fn(() => qb),
          count: jest.fn().mockResolvedValue(equipCount),
        }),
        save: jest.fn().mockImplementation(async (_E: unknown, entity: unknown) => entity),
      };
      return manager as unknown as jest.Mocked<EntityManager>;
    }

    it("repare une instance EQUIPPED orpheline -> AVAILABLE/INVENTORY chez le owner", async () => {
      const instance = makeInstance({
        ownerId: "char-1",
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
        containerId: "char-1",
      });
      const manager = makeRepairManager(instance, 0); // aucune ligne character_equipment

      const result = await service.transfer(manager, instance.id, {
        requesterId: null,
        transition: { type: "REPAIR_ORPHAN_EQUIPPED" },
      });

      expect(result.state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.containerId).toBe("char-1");
    });

    it("refuse si l instance est encore referencee par character_equipment", async () => {
      const instance = makeInstance({
        ownerId: "char-1",
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const manager = makeRepairManager(instance, 1); // une ligne existe

      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "REPAIR_ORPHAN_EQUIPPED" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une instance non-EQUIPPED", async () => {
      const instance = makeInstance({
        ownerId: "char-1",
        state: ItemInstanceState.AVAILABLE,
        containerType: ItemInstanceContainerType.INVENTORY,
      });
      const manager = makeRepairManager(instance, 0);

      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "REPAIR_ORPHAN_EQUIPPED" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si ownerId absent", async () => {
      const instance = makeInstance({
        ownerId: null,
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const manager = makeRepairManager(instance, 0);

      await expect(
        service.transfer(manager, instance.id, {
          requesterId: null,
          transition: { type: "REPAIR_ORPHAN_EQUIPPED" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── transition CRAFT_CONSUME ────────────────────────────────────────────────
  describe("transition CRAFT_CONSUME", () => {
    it("détruit une instance AVAILABLE/INVENTORY/NORMAL du personnage", async () => {
      const instance = makeInstance();
      const manager = makeManager(instance);

      const result = await service.transfer(manager, "inst-1", {
        requesterId: "char-1",
        transition: { type: "CRAFT_CONSUME", characterId: "char-1" },
      });

      expect(result.state).toBe(ItemInstanceState.DESTROYED);
      expect(result.containerType).toBe(ItemInstanceContainerType.NONE);
      expect(result.containerId).toBeNull();
      expect(manager.save).toHaveBeenCalled();
    });

    it("refuse une instance LOT", async () => {
      const manager = makeManager(makeInstance({ instanceType: ItemInstanceType.LOT }));
      await expect(
        service.transfer(manager, "inst-1", {
          requesterId: "char-1",
          transition: { type: "CRAFT_CONSUME", characterId: "char-1" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une instance EQUIPPED (état != AVAILABLE)", async () => {
      const manager = makeManager(
        makeInstance({ state: ItemInstanceState.EQUIPPED, containerType: ItemInstanceContainerType.EQUIPMENT }),
      );
      await expect(
        service.transfer(manager, "inst-1", {
          requesterId: "char-1",
          transition: { type: "CRAFT_CONSUME", characterId: "char-1" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une instance d'un autre propriétaire", async () => {
      const manager = makeManager(makeInstance({ ownerId: "char-2" }));
      await expect(
        service.transfer(manager, "inst-1", {
          requesterId: "char-1",
          transition: { type: "CRAFT_CONSUME", characterId: "char-1" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une instance hors container INVENTORY", async () => {
      // état AVAILABLE mais container BANK → validateContainer échoue.
      const manager = makeManager(
        makeInstance({ containerType: ItemInstanceContainerType.BANK, containerId: "bank-1" }),
      );
      await expect(
        service.transfer(manager, "inst-1", {
          requesterId: "char-1",
          transition: { type: "CRAFT_CONSUME", characterId: "char-1" },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── transition RESERVE_FOR_CRAFT ────────────────────────────────────────────
  describe("transition RESERVE_FOR_CRAFT", () => {
    const reserve: TransferContext = {
      requesterId: "char-1",
      transition: { type: "RESERVE_FOR_CRAFT", characterId: "char-1", jobId: "job-1" },
    };

    it("réserve une instance AVAILABLE/INVENTORY/NORMAL vers IN_CRAFT_ORDER", async () => {
      const manager = makeManager(makeInstance());

      const result = await service.transfer(manager, "inst-1", reserve);

      expect(result.state).toBe(ItemInstanceState.IN_CRAFT_ORDER);
      expect(result.containerType).toBe(ItemInstanceContainerType.CRAFT_ORDER);
      expect(result.containerId).toBe("job-1");
      expect(manager.save).toHaveBeenCalled();
    });

    it("refuse une instance LOT", async () => {
      const manager = makeManager(makeInstance({ instanceType: ItemInstanceType.LOT }));
      await expect(service.transfer(manager, "inst-1", reserve)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une instance EQUIPPED", async () => {
      const manager = makeManager(
        makeInstance({ state: ItemInstanceState.EQUIPPED, containerType: ItemInstanceContainerType.EQUIPMENT }),
      );
      await expect(service.transfer(manager, "inst-1", reserve)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une instance d'un autre propriétaire", async () => {
      const manager = makeManager(makeInstance({ ownerId: "char-2" }));
      await expect(service.transfer(manager, "inst-1", reserve)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une instance hors container INVENTORY", async () => {
      const manager = makeManager(
        makeInstance({ containerType: ItemInstanceContainerType.BANK, containerId: "bank-1" }),
      );
      await expect(service.transfer(manager, "inst-1", reserve)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── transition CONSUME_FROM_CRAFT_ORDER ─────────────────────────────────────
  describe("transition CONSUME_FROM_CRAFT_ORDER", () => {
    const consume: TransferContext = {
      requesterId: null,
      transition: { type: "CONSUME_FROM_CRAFT_ORDER", jobId: "job-1" },
    };

    function reservedInstance(overrides: Partial<ItemInstance> = {}): ItemInstance {
      return makeInstance({
        state: ItemInstanceState.IN_CRAFT_ORDER,
        containerType: ItemInstanceContainerType.CRAFT_ORDER,
        containerId: "job-1",
        ...overrides,
      });
    }

    it("détruit une instance réservée IN_CRAFT_ORDER du bon job", async () => {
      const manager = makeManager(reservedInstance());

      const result = await service.transfer(manager, "inst-1", consume);

      expect(result.state).toBe(ItemInstanceState.DESTROYED);
      expect(result.containerType).toBe(ItemInstanceContainerType.NONE);
      expect(result.containerId).toBeNull();
    });

    it("refuse une instance non IN_CRAFT_ORDER (ex: AVAILABLE)", async () => {
      const manager = makeManager(makeInstance());
      await expect(service.transfer(manager, "inst-1", consume)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une instance réservée pour un autre job", async () => {
      const manager = makeManager(reservedInstance({ containerId: "job-2" }));
      await expect(service.transfer(manager, "inst-1", consume)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une instance LOT", async () => {
      const manager = makeManager(reservedInstance({ instanceType: ItemInstanceType.LOT }));
      await expect(service.transfer(manager, "inst-1", consume)).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
