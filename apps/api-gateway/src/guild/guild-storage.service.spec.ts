import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from "../item-instances/entities/item-instance.entity";
import { Item } from "../items/entities/item.entity";
import { ItemTransferService } from "../item-transfer/item-transfer.service";
import { Guild } from "./entities/guild.entity";
import { GuildStorageService } from "./guild-storage.service";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeGuild(overrides: Partial<Guild> = {}): Guild {
  return {
    id: "guild-1",
    name: "Les Légendaires",
    ownerCharacterId: "owner-1",
    createdAt: new Date(),
    ...overrides,
  } as Guild;
}

function makeItem(): Item {
  return { id: "item-1", name: "Épée", type: "weapon", category: "equipment", image: null } as Item;
}

function makeInstance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: "inst-1",
    itemId: "item-1",
    ownerId: "owner-1",
    ownerType: "character",
    state: ItemInstanceState.AVAILABLE,
    containerType: ItemInstanceContainerType.INVENTORY,
    containerId: "owner-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ItemInstance;
}

function makeGuildsRepo(guild: Guild | null = makeGuild()) {
  return {
    findOneBy: jest.fn().mockResolvedValue(guild),
  };
}

function makeInstancesRepo(instances: ItemInstance[] = []) {
  return {
    find: jest.fn().mockResolvedValue(instances),
  };
}

function makeItemsRepo(items: Item[] = [makeItem()]) {
  return {
    findBy: jest.fn().mockResolvedValue(items),
  };
}

function makeTransfer() {
  return {
    transfer: jest.fn().mockResolvedValue({} as ItemInstance),
  };
}

function makeManager(instance: ItemInstance | null) {
  return {
    findOne: jest.fn().mockResolvedValue(instance),
  } as unknown as EntityManager;
}

function buildService(
  instance: ItemInstance | null,
  guild: Guild | null = makeGuild(),
  storedInstances: ItemInstance[] = [],
  items: Item[] = [makeItem()],
) {
  const guildsRepo = makeGuildsRepo(guild);
  const instancesRepo = makeInstancesRepo(storedInstances);
  const itemsRepo = makeItemsRepo(items);
  const itemTransfer = makeTransfer();

  const dataSource = {
    transaction: jest.fn(async (fn: (mgr: EntityManager) => unknown) =>
      fn(makeManager(instance)),
    ),
  };

  const service = new GuildStorageService(
    guildsRepo as unknown as Repository<Guild>,
    instancesRepo as unknown as Repository<ItemInstance>,
    itemsRepo as unknown as Repository<Item>,
    dataSource as unknown as DataSource,
    itemTransfer as unknown as ItemTransferService,
  );

  return { service, itemTransfer, dataSource, guildsRepo };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("GuildStorageService", () => {

  // ── listContents ──────────────────────────────────────────────────────────

  describe("listContents", () => {
    it("retourne les instances stockees dans la guilde", async () => {
      const inst = makeInstance({
        state: ItemInstanceState.IN_GUILD_STORAGE,
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
        containerId: "guild-1",
      });
      const { service } = buildService(null, makeGuild(), [inst]);
      const result = await service.listContents("owner-1", "guild-1");
      expect(result).toHaveLength(1);
      expect(result[0].instanceId).toBe("inst-1");
    });

    it("retourne un tableau vide si aucune instance", async () => {
      const { service } = buildService(null, makeGuild(), []);
      const result = await service.listContents("owner-1", "guild-1");
      expect(result).toHaveLength(0);
    });

    it("leve ForbiddenException si le personnage n est pas proprietaire", async () => {
      const { service } = buildService(null, makeGuild());
      await expect(service.listContents("non-owner", "guild-1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("leve NotFoundException si la guilde n existe pas", async () => {
      const { service } = buildService(null, null);
      await expect(service.listContents("owner-1", "ghost")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── deposit ───────────────────────────────────────────────────────────────

  describe("deposit", () => {
    it("appelle STORE_GUILD via ItemTransferService", async () => {
      const instance = makeInstance();
      const { service, itemTransfer } = buildService(instance);

      await service.deposit("owner-1", "guild-1", "inst-1");

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({ transition: { type: "STORE_GUILD", guildId: "guild-1" } }),
      );
    });

    it("leve NotFoundException si instance inexistante", async () => {
      const { service } = buildService(null);
      await expect(service.deposit("owner-1", "guild-1", "ghost")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("leve ForbiddenException si personnage non proprietaire de la guilde", async () => {
      const instance = makeInstance({ ownerId: "non-owner" });
      const { service } = buildService(instance);
      await expect(service.deposit("non-owner", "guild-1", "inst-1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuse si l instance n appartient pas au personnage", async () => {
      const instance = makeInstance({ ownerId: "autre" });
      const { service } = buildService(instance);
      await expect(service.deposit("owner-1", "guild-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est equipee", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const { service } = buildService(instance);
      await expect(service.deposit("owner-1", "guild-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est en Auction", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.LISTED,
        containerType: ItemInstanceContainerType.AUCTION,
        containerId: "listing-1",
      });
      const { service } = buildService(instance);
      await expect(service.deposit("owner-1", "guild-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est en Mail", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_MAIL,
        containerType: ItemInstanceContainerType.MAIL,
        containerId: "mail-1",
      });
      const { service } = buildService(instance);
      await expect(service.deposit("owner-1", "guild-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse le double depot (deja en guild storage)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_GUILD_STORAGE,
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
        containerId: "guild-1",
      });
      const { service } = buildService(instance);
      await expect(service.deposit("owner-1", "guild-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("propage l erreur si ItemTransferService rejette (rollback)", async () => {
      const instance = makeInstance();
      const { service, itemTransfer } = buildService(instance);
      itemTransfer.transfer.mockRejectedValue(new BadRequestException("etat invalide"));
      await expect(service.deposit("owner-1", "guild-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("pose un verrou pessimiste via ItemTransferService", async () => {
      const instance = makeInstance();
      const { service, itemTransfer } = buildService(instance);
      await service.deposit("owner-1", "guild-1", "inst-1");
      expect(itemTransfer.transfer).toHaveBeenCalledTimes(1);
    });
  });

  // ── withdraw ──────────────────────────────────────────────────────────────

  describe("withdraw", () => {
    it("appelle WITHDRAW_GUILD via ItemTransferService", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_GUILD_STORAGE,
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
        containerId: "guild-1",
      });
      const { service, itemTransfer } = buildService(instance);

      await service.withdraw("owner-1", "guild-1", "inst-1");

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({
          transition: { type: "WITHDRAW_GUILD", guildId: "guild-1", characterId: "owner-1" },
        }),
      );
    });

    it("leve NotFoundException si instance inexistante", async () => {
      const { service } = buildService(null);
      await expect(service.withdraw("owner-1", "guild-1", "ghost")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("leve ForbiddenException si personnage non proprietaire de la guilde", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_GUILD_STORAGE,
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
        containerId: "guild-1",
      });
      const { service } = buildService(instance);
      await expect(service.withdraw("non-owner", "guild-1", "inst-1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuse si l instance n est pas dans cette guilde", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_GUILD_STORAGE,
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
        containerId: "autre-guild",
      });
      const { service } = buildService(instance);
      await expect(service.withdraw("owner-1", "guild-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance n est pas en guild storage (double retrait)", async () => {
      const instance = makeInstance({ state: ItemInstanceState.AVAILABLE });
      const { service } = buildService(instance);
      await expect(service.withdraw("owner-1", "guild-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("pose un verrou pessimiste via ItemTransferService", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_GUILD_STORAGE,
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
        containerId: "guild-1",
      });
      const { service, itemTransfer } = buildService(instance);
      await service.withdraw("owner-1", "guild-1", "inst-1");
      expect(itemTransfer.transfer).toHaveBeenCalledTimes(1);
    });
  });
});
