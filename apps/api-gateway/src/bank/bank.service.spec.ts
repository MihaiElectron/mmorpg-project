import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from "../item-instances/entities/item-instance.entity";
import { Item } from "../items/entities/item.entity";
import { ItemTransferService } from "../item-transfer/item-transfer.service";
import { BankService } from "./bank.service";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(): Item {
  return { id: "item-1", name: "Épée de base", type: "weapon", category: "equipment", image: null } as Item;
}

function makeInstance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: "inst-1",
    itemId: "item-1",
    ownerId: "char-1",
    ownerType: "character",
    state: ItemInstanceState.AVAILABLE,
    containerType: ItemInstanceContainerType.INVENTORY,
    containerId: "char-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ItemInstance;
}

function makeInstancesRepo(instances: ItemInstance[] = []) {
  return {
    find: jest.fn().mockResolvedValue(instances),
    findBy: jest.fn().mockResolvedValue([]),
  };
}

function makeItemsRepo(items: Item[] = [makeItem()]) {
  return {
    findBy: jest.fn().mockResolvedValue(items),
  };
}

function makeTransfer() {
  return {
    transfer: jest.fn().mockImplementation(async (_mgr, _id, ctx) => {
      // Simule la mutation en mémoire (pattern identique aux tests Auction)
      return { id: _id } as ItemInstance;
    }),
  };
}

function makeManager(instance: ItemInstance | null) {
  return {
    findOne: jest.fn().mockResolvedValue(instance),
  } as unknown as EntityManager;
}

function buildService(
  instance: ItemInstance | null,
  bankedInstances: ItemInstance[] = [],
  items: Item[] = [makeItem()],
) {
  const instancesRepo = makeInstancesRepo(bankedInstances);
  const itemsRepo = makeItemsRepo(items);
  const itemTransfer = makeTransfer();

  const dataSource = {
    transaction: jest.fn(async (fn: (mgr: EntityManager) => unknown) =>
      fn(makeManager(instance)),
    ),
  };

  const service = new BankService(
    instancesRepo as unknown as Repository<ItemInstance>,
    itemsRepo as unknown as Repository<Item>,
    dataSource as unknown as DataSource,
    itemTransfer as unknown as ItemTransferService,
  );

  return { service, itemTransfer, dataSource, instancesRepo };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("BankService", () => {

  // ── listContents ──────────────────────────────────────────────────────────

  describe("listContents", () => {
    it("retourne la liste des instances en banque", async () => {
      const inst = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
        containerId: "char-1",
      });
      const { service } = buildService(null, [inst]);

      const result = await service.listContents("char-1");
      expect(result).toHaveLength(1);
      expect(result[0].instanceId).toBe("inst-1");
    });

    it("retourne un tableau vide si aucune instance en banque", async () => {
      const { service } = buildService(null, []);
      const result = await service.listContents("char-1");
      expect(result).toHaveLength(0);
    });

    it("filtre les instances dont l item est introuvable", async () => {
      const inst = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
        itemId: "item-inconnu",
      });
      const { service } = buildService(null, [inst], []);
      const result = await service.listContents("char-1");
      expect(result).toHaveLength(0);
    });
  });

  // ── deposit ───────────────────────────────────────────────────────────────

  describe("deposit", () => {
    it("appelle STORE_BANK via ItemTransferService", async () => {
      const instance = makeInstance();
      const { service, itemTransfer } = buildService(instance);

      await service.deposit("char-1", "inst-1");

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({ transition: { type: "STORE_BANK", characterId: "char-1" } }),
      );
    });

    it("leve NotFoundException si instance inexistante", async () => {
      const { service } = buildService(null);
      await expect(service.deposit("char-1", "ghost")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuse si l instance n appartient pas au personnage", async () => {
      const instance = makeInstance({ ownerId: "other" });
      const { service } = buildService(instance);
      await expect(service.deposit("char-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est equipee (container EQUIPMENT)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const { service } = buildService(instance);
      await expect(service.deposit("char-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est en vente aux encheres (container AUCTION)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.LISTED,
        containerType: ItemInstanceContainerType.AUCTION,
        containerId: "listing-1",
      });
      const { service } = buildService(instance);
      await expect(service.deposit("char-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est deja en banque (double depot)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
      });
      const { service } = buildService(instance);
      await expect(service.deposit("char-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("propage l erreur si ItemTransferService rejette (rollback)", async () => {
      const instance = makeInstance();
      const { service, itemTransfer } = buildService(instance);
      itemTransfer.transfer.mockRejectedValue(new BadRequestException("etat invalide"));
      await expect(service.deposit("char-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── withdraw ──────────────────────────────────────────────────────────────

  describe("withdraw", () => {
    it("appelle WITHDRAW_BANK via ItemTransferService", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
        containerId: "char-1",
      });
      const { service, itemTransfer } = buildService(instance);

      await service.withdraw("char-1", "inst-1");

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({ transition: { type: "WITHDRAW_BANK", characterId: "char-1" } }),
      );
    });

    it("leve NotFoundException si instance inexistante", async () => {
      const { service } = buildService(null);
      await expect(service.withdraw("char-1", "ghost")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuse si l instance n appartient pas au personnage", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
        ownerId: "other",
      });
      const { service } = buildService(instance);
      await expect(service.withdraw("char-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance n est pas en banque (double retrait)", async () => {
      // ItemTransferService valide state=IN_BANK — le transfer mock leve ici
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const { service, itemTransfer } = buildService(instance);
      itemTransfer.transfer.mockRejectedValue(new BadRequestException("Expected state IN_BANK"));
      await expect(service.withdraw("char-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("pose un verrou pessimiste via ItemTransferService (appel transfer)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
        containerId: "char-1",
      });
      const { service, itemTransfer } = buildService(instance);
      await service.withdraw("char-1", "inst-1");
      expect(itemTransfer.transfer).toHaveBeenCalledTimes(1);
    });
  });
});
