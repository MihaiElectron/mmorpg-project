import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from "../item-instances/entities/item-instance.entity";
import { Item } from "../items/entities/item.entity";
import { ItemTransferService } from "../item-transfer/item-transfer.service";
import { TradeSession, TradeSessionState } from "./entities/trade-session.entity";
import { TradeService } from "./trade.service";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<TradeSession> = {}): TradeSession {
  return {
    id: "trade-1",
    characterAId: "char-a",
    characterBId: "char-b",
    state: TradeSessionState.PENDING,
    acceptedA: false,
    acceptedB: false,
    createdAt: new Date(),
    ...overrides,
  } as TradeSession;
}

function makeItem(): Item {
  return { id: "item-1", name: "Épée", type: "weapon", category: "equipment", image: null } as Item;
}

function makeInstance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: "inst-1",
    itemId: "item-1",
    ownerId: "char-a",
    ownerType: "character",
    state: ItemInstanceState.AVAILABLE,
    containerType: ItemInstanceContainerType.INVENTORY,
    containerId: "char-a",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ItemInstance;
}

function makeSessionsRepo(session: TradeSession | null = makeSession()) {
  return {
    findOneBy: jest.fn().mockResolvedValue(session),
    create: jest.fn((data: Partial<TradeSession>) => ({ ...data } as TradeSession)),
    save: jest.fn(async (s: TradeSession) => s),
  };
}

function makeInstancesRepo(instances: ItemInstance[] = []) {
  return { find: jest.fn().mockResolvedValue(instances) };
}

function makeItemsRepo(items: Item[] = [makeItem()]) {
  return { findBy: jest.fn().mockResolvedValue(items) };
}

function makeTransfer() {
  return { transfer: jest.fn().mockResolvedValue({} as ItemInstance) };
}

function makeManager(
  instance: ItemInstance | null,
  session: TradeSession | null = makeSession(),
  tradeItems: ItemInstance[] = [],
) {
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(session),
  };
  return {
    findOne: jest.fn().mockResolvedValue(instance),
    find: jest.fn().mockResolvedValue(tradeItems),
    getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn(() => qb) }),
    save: jest.fn(async (_E: unknown, data: unknown) => data),
    _qb: qb,
  } as unknown as EntityManager & { _qb: typeof qb };
}

function buildService(
  instance: ItemInstance | null,
  session: TradeSession | null = makeSession(),
  tradeItems: ItemInstance[] = [],
  items: Item[] = [makeItem()],
) {
  const sessionsRepo = makeSessionsRepo(session);
  const instancesRepo = makeInstancesRepo(tradeItems);
  const itemsRepo = makeItemsRepo(items);
  const itemTransfer = makeTransfer();
  const mgr = makeManager(instance, session, tradeItems);

  const dataSource = {
    transaction: jest.fn(async (fn: (m: EntityManager) => unknown) => fn(mgr)),
  };

  const service = new TradeService(
    sessionsRepo as unknown as Repository<TradeSession>,
    instancesRepo as unknown as Repository<ItemInstance>,
    itemsRepo as unknown as Repository<Item>,
    dataSource as unknown as DataSource,
    itemTransfer as unknown as ItemTransferService,
  );

  return { service, itemTransfer, dataSource, sessionsRepo, mgr };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("TradeService", () => {

  // ── createTrade ───────────────────────────────────────────────────────────

  describe("createTrade", () => {
    it("cree une session de trade entre deux personnages", async () => {
      const { service, sessionsRepo } = buildService(null);
      await service.createTrade("char-a", "char-b");
      expect(sessionsRepo.save).toHaveBeenCalled();
    });

    it("refuse si les deux personnages sont identiques", async () => {
      const { service } = buildService(null);
      await expect(service.createTrade("char-a", "char-a")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── addItem ───────────────────────────────────────────────────────────────

  describe("addItem", () => {
    it("appelle TRADE_LOCK via ItemTransferService", async () => {
      const instance = makeInstance();
      const { service, itemTransfer } = buildService(instance);

      await service.addItem("char-a", "trade-1", "inst-1");

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({ transition: { type: "TRADE_LOCK", tradeSessionId: "trade-1" } }),
      );
    });

    it("leve NotFoundException si instance inexistante", async () => {
      const { service } = buildService(null);
      await expect(service.addItem("char-a", "trade-1", "ghost")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("leve ForbiddenException si personnage non participant", async () => {
      const instance = makeInstance({ ownerId: "intrus" });
      const { service } = buildService(instance);
      await expect(service.addItem("intrus", "trade-1", "inst-1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuse si l instance n appartient pas au personnage", async () => {
      const instance = makeInstance({ ownerId: "autre" });
      const { service } = buildService(instance);
      await expect(service.addItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si la session n est pas en etat PENDING", async () => {
      const session = makeSession({ state: TradeSessionState.COMPLETED });
      const instance = makeInstance();
      const { service } = buildService(instance, session);
      await expect(service.addItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est deja dans un Trade (double ajout)", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_TRADE,
        containerType: ItemInstanceContainerType.TRADE,
        containerId: "trade-1",
      });
      const { service } = buildService(instance);
      await expect(service.addItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est equipee", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.EQUIPPED,
        containerType: ItemInstanceContainerType.EQUIPMENT,
      });
      const { service } = buildService(instance);
      await expect(service.addItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est en Auction", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.LISTED,
        containerType: ItemInstanceContainerType.AUCTION,
      });
      const { service } = buildService(instance);
      await expect(service.addItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est en Mail", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_MAIL,
        containerType: ItemInstanceContainerType.MAIL,
      });
      const { service } = buildService(instance);
      await expect(service.addItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est en Guild Storage", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_GUILD_STORAGE,
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
      });
      const { service } = buildService(instance);
      await expect(service.addItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance est en Housing", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_HOUSING,
        containerType: ItemInstanceContainerType.HOUSING,
      });
      const { service } = buildService(instance);
      await expect(service.addItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("remet les accept flags a false", async () => {
      const session = makeSession({ acceptedA: true, acceptedB: false });
      const instance = makeInstance();
      const { service, mgr } = buildService(instance, session);
      await service.addItem("char-a", "trade-1", "inst-1");
      expect(mgr.save).toHaveBeenCalledWith(
        TradeSession,
        expect.objectContaining({ acceptedA: false, acceptedB: false }),
      );
    });

    it("propage l erreur si ItemTransferService rejette (rollback)", async () => {
      const instance = makeInstance();
      const { service, itemTransfer } = buildService(instance);
      itemTransfer.transfer.mockRejectedValue(new BadRequestException("etat invalide"));
      await expect(service.addItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── removeItem ────────────────────────────────────────────────────────────

  describe("removeItem", () => {
    it("appelle TRADE_CANCEL via ItemTransferService", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_TRADE,
        containerType: ItemInstanceContainerType.TRADE,
        containerId: "trade-1",
      });
      const { service, itemTransfer } = buildService(instance);

      await service.removeItem("char-a", "trade-1", "inst-1");

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({ transition: { type: "TRADE_CANCEL", tradeSessionId: "trade-1" } }),
      );
    });

    it("refuse si l instance n appartient pas au personnage", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_TRADE,
        containerType: ItemInstanceContainerType.TRADE,
        containerId: "trade-1",
        ownerId: "char-b",
      });
      const { service } = buildService(instance);
      await expect(service.removeItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si l instance n est pas dans cette session", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.AVAILABLE,
        containerType: ItemInstanceContainerType.INVENTORY,
      });
      const { service } = buildService(instance);
      await expect(service.removeItem("char-a", "trade-1", "inst-1")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── accept ────────────────────────────────────────────────────────────────

  describe("accept", () => {
    it("accepte pour le joueur A uniquement (pas de commit)", async () => {
      const session = makeSession({ acceptedA: false, acceptedB: false });
      const { service, mgr } = buildService(null, session);

      await service.accept("char-a", "trade-1");

      expect(mgr.save).toHaveBeenCalledWith(
        TradeSession,
        expect.objectContaining({ acceptedA: true, acceptedB: false, state: TradeSessionState.PENDING }),
      );
    });

    it("commit quand les deux joueurs ont accepte", async () => {
      const session = makeSession({ acceptedA: true, acceptedB: false });
      const inst1 = makeInstance({ id: "inst-b", ownerId: "char-b", state: ItemInstanceState.IN_TRADE, containerType: ItemInstanceContainerType.TRADE, containerId: "trade-1" });
      const { service, itemTransfer, mgr } = buildService(null, session, [inst1]);

      await service.accept("char-b", "trade-1");

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-b",
        expect.objectContaining({
          transition: expect.objectContaining({ type: "TRADE_COMMIT", recipientCharacterId: "char-a" }),
        }),
      );
      expect(mgr.save).toHaveBeenCalledWith(
        TradeSession,
        expect.objectContaining({ state: TradeSessionState.COMPLETED }),
      );
    });

    it("refuse le double accept du meme joueur", async () => {
      const session = makeSession({ acceptedA: true, acceptedB: false });
      const { service } = buildService(null, session);
      await expect(service.accept("char-a", "trade-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("leve ForbiddenException si joueur non participant", async () => {
      const { service } = buildService(null);
      await expect(service.accept("intrus", "trade-1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuse si la session n est pas PENDING", async () => {
      const session = makeSession({ state: TradeSessionState.COMPLETED });
      const { service } = buildService(null, session);
      await expect(service.accept("char-a", "trade-1")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── cancel ────────────────────────────────────────────────────────────────

  describe("cancel", () => {
    it("retourne tous les objets et marque CANCELLED", async () => {
      const session = makeSession();
      const inst = makeInstance({ state: ItemInstanceState.IN_TRADE, containerType: ItemInstanceContainerType.TRADE, containerId: "trade-1" });
      const { service, itemTransfer, mgr } = buildService(null, session, [inst]);

      await service.cancel("char-a", "trade-1");

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({ transition: { type: "TRADE_CANCEL", tradeSessionId: "trade-1" } }),
      );
      expect(mgr.save).toHaveBeenCalledWith(
        TradeSession,
        expect.objectContaining({ state: TradeSessionState.CANCELLED }),
      );
    });

    it("refuse la double annulation (deja CANCELLED)", async () => {
      const session = makeSession({ state: TradeSessionState.CANCELLED });
      const { service } = buildService(null, session);
      await expect(service.cancel("char-a", "trade-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse l annulation d un trade COMPLETED", async () => {
      const session = makeSession({ state: TradeSessionState.COMPLETED });
      const { service } = buildService(null, session);
      await expect(service.cancel("char-a", "trade-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("leve ForbiddenException si joueur non participant", async () => {
      const { service } = buildService(null);
      await expect(service.cancel("intrus", "trade-1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("pose un verrou pessimiste via lockSession (appel transfer)", async () => {
      const session = makeSession();
      const { service, mgr } = buildService(null, session, []);
      await service.cancel("char-a", "trade-1");
      expect(mgr.getRepository).toHaveBeenCalled();
    });
  });

  // ── anti-deadlock (ordre déterministe) ────────────────────────────────────

  describe("ordre de verrouillage anti-deadlock", () => {
    it("appelle TRADE_COMMIT dans l ordre lexicographique des UUIDs", async () => {
      const session = makeSession({ acceptedA: true });
      const instA = makeInstance({ id: "aaa-inst", ownerId: "char-a", state: ItemInstanceState.IN_TRADE, containerType: ItemInstanceContainerType.TRADE, containerId: "trade-1" });
      const instB = makeInstance({ id: "zzz-inst", ownerId: "char-b", state: ItemInstanceState.IN_TRADE, containerType: ItemInstanceContainerType.TRADE, containerId: "trade-1" });
      const { service, itemTransfer } = buildService(null, session, [instB, instA]);

      await service.accept("char-b", "trade-1");

      const calls = itemTransfer.transfer.mock.calls.map((c) => c[1]);
      expect(calls[0]).toBe("aaa-inst");
      expect(calls[1]).toBe("zzz-inst");
    });
  });
});
