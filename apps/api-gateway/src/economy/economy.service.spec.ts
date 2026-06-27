import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Wallet, WalletStatus } from './entities/wallet.entity';
import { EconomicTransaction, TransactionStatus, TransactionType } from './entities/economic-transaction.entity';
import { LedgerDirection, LedgerEntry } from './entities/ledger-entry.entity';
import { EconomyService } from './economy.service';

function makeRepo<T>() {
  return {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn((data: Partial<T>) => data),
    save: jest.fn(async (value: unknown) => value),
  } as unknown as jest.Mocked<Repository<T>>;
}

function makeWallet(id: string, balance: string, status = WalletStatus.ACTIVE): Wallet {
  return { id, ownerType: 'CHARACTER', ownerId: `owner-${id}`, balanceBronze: balance, status } as Wallet;
}

function makeManager(walletRegistry: Record<string, Wallet>): jest.Mocked<EntityManager> {
  let capturedWalletId: string | null = null;

  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn((_clause: string, params: { id: string }) => {
      capturedWalletId = params.id;
      return qb;
    }),
    getOne: jest.fn(async () => (capturedWalletId ? (walletRegistry[capturedWalletId] ?? null) : null)),
  };

  return {
    getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })),
    create: jest.fn((_Entity: unknown, data: unknown) => ({ ...(data as object) })),
    save: jest.fn(async (_Entity: unknown, data: unknown) => ({ id: 'tx-1', ...(data as object) })),
  } as unknown as jest.Mocked<EntityManager>;
}

describe("EconomyService", () => {
  let service: EconomyService;
  let wallets: jest.Mocked<Repository<Wallet>>;
  let transactions: jest.Mocked<Repository<EconomicTransaction>>;
  let ledgerEntries: jest.Mocked<Repository<LedgerEntry>>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    wallets = makeRepo<Wallet>();
    transactions = makeRepo<EconomicTransaction>();
    ledgerEntries = makeRepo<LedgerEntry>();

    dataSource = {
      transaction: jest.fn(async (fn: (manager: EntityManager) => unknown) =>
        fn(makeManager({})),
      ),
    };

    service = new EconomyService(
      wallets,
      transactions,
      ledgerEntries,
      dataSource as unknown as DataSource,
    );
  });

  describe("getOrCreateWallet", () => {
    it("retourne le wallet existant sans en créer un nouveau", async () => {
      const existing = makeWallet("w1", "500");
      wallets.findOne.mockResolvedValue(existing);

      const result = await service.getOrCreateWallet("CHARACTER", "owner-w1");

      expect(result).toBe(existing);
      expect(wallets.save).not.toHaveBeenCalled();
    });

    it("crée un nouveau wallet avec solde zéro si absent", async () => {
      wallets.findOne.mockResolvedValue(null);
      wallets.create.mockReturnValue({ ownerType: "CHARACTER", ownerId: "owner-new", balanceBronze: "0", status: WalletStatus.ACTIVE } as Wallet);
      wallets.save.mockResolvedValue({ id: "w-new", ownerType: "CHARACTER", ownerId: "owner-new", balanceBronze: "0", status: WalletStatus.ACTIVE } as Wallet);

      const result = await service.getOrCreateWallet("CHARACTER", "owner-new");

      expect(wallets.save).toHaveBeenCalled();
      expect(result.balanceBronze).toBe("0");
      expect(result.status).toBe(WalletStatus.ACTIVE);
    });
  });

  describe("getBalance", () => {
    it("retourne le solde en bigint", async () => {
      wallets.findOneBy.mockResolvedValue(makeWallet("w1", "1234567890"));

      const balance = await service.getBalance("w1");

      expect(balance).toBe(1234567890n);
    });

    it("lève une NotFoundException si le wallet est introuvable", async () => {
      wallets.findOneBy.mockResolvedValue(null);

      await expect(service.getBalance("inexistant")).rejects.toThrow(NotFoundException);
    });
  });

  describe("credit", () => {
    it("crédite le wallet et enregistre la transaction et le ledger", async () => {
      const wallet = makeWallet("w1", "100");
      const manager = makeManager({ w1: wallet });
      dataSource.transaction.mockImplementation(async (fn) => fn(manager));

      const tx = await service.credit({
        type: TransactionType.LOOT,
        destinationWalletId: "w1",
        amountBronze: 50n,
      });

      expect(manager.save).toHaveBeenCalledWith(Wallet, expect.objectContaining({ balanceBronze: "150" }));
      expect(manager.save).toHaveBeenCalledWith(
        EconomicTransaction,
        expect.objectContaining({
          type: TransactionType.LOOT,
          status: TransactionStatus.APPLIED,
          amountBronze: "50",
          destinationWalletId: "w1",
        }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        LedgerEntry,
        expect.objectContaining({
          direction: LedgerDirection.CREDIT,
          amountBronze: "50",
          balanceAfterBronze: "150",
        }),
      );
      expect(tx).toBeDefined();
    });

    it("rejette un montant nul", async () => {
      await expect(
        service.credit({ type: TransactionType.LOOT, destinationWalletId: "w1", amountBronze: 0n }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette un montant négatif", async () => {
      await expect(
        service.credit({ type: TransactionType.LOOT, destinationWalletId: "w1", amountBronze: -1n }),
      ).rejects.toThrow(BadRequestException);
    });

    it("retourne la transaction existante sur clé d'idempotence avec payload compatible", async () => {
      const existingTx = {
        id: "existing-tx",
        idempotencyKey: "key-abc",
        type: TransactionType.LOOT,
        amountBronze: "100",
        sourceWalletId: null,
        destinationWalletId: "w1",
      } as EconomicTransaction;
      transactions.findOne.mockResolvedValue(existingTx);

      const result = await service.credit({
        type: TransactionType.LOOT,
        destinationWalletId: "w1",
        amountBronze: 100n,
        idempotencyKey: "key-abc",
      });

      expect(result).toBe(existingTx);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("rejette si même clé mais montant différent", async () => {
      transactions.findOne.mockResolvedValue({
        id: "existing-tx",
        idempotencyKey: "key-abc",
        type: TransactionType.LOOT,
        amountBronze: "100",
        sourceWalletId: null,
        destinationWalletId: "w1",
      } as EconomicTransaction);

      await expect(
        service.credit({ type: TransactionType.LOOT, destinationWalletId: "w1", amountBronze: 999n, idempotencyKey: "key-abc" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette si même clé mais wallet destinataire différent", async () => {
      transactions.findOne.mockResolvedValue({
        id: "existing-tx",
        idempotencyKey: "key-abc",
        type: TransactionType.LOOT,
        amountBronze: "100",
        sourceWalletId: null,
        destinationWalletId: "w1",
      } as EconomicTransaction);

      await expect(
        service.credit({ type: TransactionType.LOOT, destinationWalletId: "w-autre", amountBronze: 100n, idempotencyKey: "key-abc" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette si même clé mais type différent", async () => {
      transactions.findOne.mockResolvedValue({
        id: "existing-tx",
        idempotencyKey: "key-abc",
        type: TransactionType.LOOT,
        amountBronze: "100",
        sourceWalletId: null,
        destinationWalletId: "w1",
      } as EconomicTransaction);

      await expect(
        service.credit({ type: TransactionType.QUEST, destinationWalletId: "w1", amountBronze: 100n, idempotencyKey: "key-abc" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette si le wallet est gelé", async () => {
      const frozen = makeWallet("w1", "100", WalletStatus.FROZEN);
      const manager = makeManager({ w1: frozen });
      dataSource.transaction.mockImplementation(async (fn) => fn(manager));

      await expect(
        service.credit({ type: TransactionType.LOOT, destinationWalletId: "w1", amountBronze: 50n }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("debit", () => {
    it("débite le wallet et enregistre la transaction et le ledger", async () => {
      const wallet = makeWallet("w1", "500");
      const manager = makeManager({ w1: wallet });
      dataSource.transaction.mockImplementation(async (fn) => fn(manager));

      await service.debit({
        type: TransactionType.NPC_BUY,
        sourceWalletId: "w1",
        amountBronze: 200n,
      });

      expect(manager.save).toHaveBeenCalledWith(Wallet, expect.objectContaining({ balanceBronze: "300" }));
      expect(manager.save).toHaveBeenCalledWith(
        EconomicTransaction,
        expect.objectContaining({
          type: TransactionType.NPC_BUY,
          status: TransactionStatus.APPLIED,
          amountBronze: "200",
          sourceWalletId: "w1",
        }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        LedgerEntry,
        expect.objectContaining({
          direction: LedgerDirection.DEBIT,
          amountBronze: "200",
          balanceAfterBronze: "300",
        }),
      );
    });

    it("rejette si le solde est insuffisant", async () => {
      const wallet = makeWallet("w1", "100");
      const manager = makeManager({ w1: wallet });
      dataSource.transaction.mockImplementation(async (fn) => fn(manager));

      await expect(
        service.debit({ type: TransactionType.NPC_BUY, sourceWalletId: "w1", amountBronze: 200n }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette un montant nul", async () => {
      await expect(
        service.debit({ type: TransactionType.NPC_BUY, sourceWalletId: "w1", amountBronze: 0n }),
      ).rejects.toThrow(BadRequestException);
    });

    it("retourne la transaction existante sur clé d'idempotence avec payload compatible", async () => {
      const existingTx = {
        id: "existing-tx",
        idempotencyKey: "debit-key",
        type: TransactionType.NPC_BUY,
        amountBronze: "100",
        sourceWalletId: "w1",
        destinationWalletId: null,
      } as EconomicTransaction;
      transactions.findOne.mockResolvedValue(existingTx);

      const result = await service.debit({
        type: TransactionType.NPC_BUY,
        sourceWalletId: "w1",
        amountBronze: 100n,
        idempotencyKey: "debit-key",
      });

      expect(result).toBe(existingTx);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("rejette si même clé mais montant différent", async () => {
      transactions.findOne.mockResolvedValue({
        id: "existing-tx",
        idempotencyKey: "debit-key",
        type: TransactionType.NPC_BUY,
        amountBronze: "100",
        sourceWalletId: "w1",
        destinationWalletId: null,
      } as EconomicTransaction);

      await expect(
        service.debit({ type: TransactionType.NPC_BUY, sourceWalletId: "w1", amountBronze: 50n, idempotencyKey: "debit-key" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette si même clé mais wallet source différent", async () => {
      transactions.findOne.mockResolvedValue({
        id: "existing-tx",
        idempotencyKey: "debit-key",
        type: TransactionType.NPC_BUY,
        amountBronze: "100",
        sourceWalletId: "w1",
        destinationWalletId: null,
      } as EconomicTransaction);

      await expect(
        service.debit({ type: TransactionType.NPC_BUY, sourceWalletId: "w-autre", amountBronze: 100n, idempotencyKey: "debit-key" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette si même clé mais type différent", async () => {
      transactions.findOne.mockResolvedValue({
        id: "existing-tx",
        idempotencyKey: "debit-key",
        type: TransactionType.NPC_BUY,
        amountBronze: "100",
        sourceWalletId: "w1",
        destinationWalletId: null,
      } as EconomicTransaction);

      await expect(
        service.debit({ type: TransactionType.CRAFT_PAYMENT, sourceWalletId: "w1", amountBronze: 100n, idempotencyKey: "debit-key" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("refuse le débit sur un wallet fermé", async () => {
      const closed = makeWallet("w1", "500", WalletStatus.CLOSED);
      const manager = makeManager({ w1: closed });
      dataSource.transaction.mockImplementation(async (fn) => fn(manager));

      await expect(
        service.debit({ type: TransactionType.NPC_BUY, sourceWalletId: "w1", amountBronze: 100n }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("transfer", () => {
    it("transfère le montant entre deux wallets avec deux entrées ledger", async () => {
      const source = makeWallet("aaa-w1", "1000");
      const dest = makeWallet("bbb-w2", "200");
      const manager = makeManager({ "aaa-w1": source, "bbb-w2": dest });
      dataSource.transaction.mockImplementation(async (fn) => fn(manager));

      await service.transfer({
        type: TransactionType.PLAYER_TRADE,
        sourceWalletId: "aaa-w1",
        destinationWalletId: "bbb-w2",
        amountBronze: 300n,
      });

      expect(manager.save).toHaveBeenCalledWith(Wallet, expect.objectContaining({ id: "aaa-w1", balanceBronze: "700" }));
      expect(manager.save).toHaveBeenCalledWith(Wallet, expect.objectContaining({ id: "bbb-w2", balanceBronze: "500" }));
      expect(manager.save).toHaveBeenCalledWith(
        LedgerEntry,
        expect.objectContaining({ direction: LedgerDirection.DEBIT, walletId: "aaa-w1" }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        LedgerEntry,
        expect.objectContaining({ direction: LedgerDirection.CREDIT, walletId: "bbb-w2" }),
      );
    });

    it("rejette si le solde source est insuffisant", async () => {
      const source = makeWallet("aaa-w1", "100");
      const dest = makeWallet("bbb-w2", "0");
      const manager = makeManager({ "aaa-w1": source, "bbb-w2": dest });
      dataSource.transaction.mockImplementation(async (fn) => fn(manager));

      await expect(
        service.transfer({
          type: TransactionType.PLAYER_TRADE,
          sourceWalletId: "aaa-w1",
          destinationWalletId: "bbb-w2",
          amountBronze: 200n,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette un montant nul", async () => {
      await expect(
        service.transfer({
          type: TransactionType.PLAYER_TRADE,
          sourceWalletId: "aaa-w1",
          destinationWalletId: "bbb-w2",
          amountBronze: 0n,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("retourne la transaction existante sur clé d'idempotence avec payload compatible", async () => {
      const existingTx = {
        id: "existing-tx",
        idempotencyKey: "transfer-key",
        type: TransactionType.PLAYER_TRADE,
        amountBronze: "100",
        sourceWalletId: "aaa-w1",
        destinationWalletId: "bbb-w2",
      } as EconomicTransaction;
      transactions.findOne.mockResolvedValue(existingTx);

      const result = await service.transfer({
        type: TransactionType.PLAYER_TRADE,
        sourceWalletId: "aaa-w1",
        destinationWalletId: "bbb-w2",
        amountBronze: 100n,
        idempotencyKey: "transfer-key",
      });

      expect(result).toBe(existingTx);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it("rejette si même clé mais montant différent", async () => {
      transactions.findOne.mockResolvedValue({
        id: "existing-tx",
        idempotencyKey: "transfer-key",
        type: TransactionType.PLAYER_TRADE,
        amountBronze: "100",
        sourceWalletId: "aaa-w1",
        destinationWalletId: "bbb-w2",
      } as EconomicTransaction);

      await expect(
        service.transfer({ type: TransactionType.PLAYER_TRADE, sourceWalletId: "aaa-w1", destinationWalletId: "bbb-w2", amountBronze: 999n, idempotencyKey: "transfer-key" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette si même clé mais wallet source différent", async () => {
      transactions.findOne.mockResolvedValue({
        id: "existing-tx",
        idempotencyKey: "transfer-key",
        type: TransactionType.PLAYER_TRADE,
        amountBronze: "100",
        sourceWalletId: "aaa-w1",
        destinationWalletId: "bbb-w2",
      } as EconomicTransaction);

      await expect(
        service.transfer({ type: TransactionType.PLAYER_TRADE, sourceWalletId: "aaa-autre", destinationWalletId: "bbb-w2", amountBronze: 100n, idempotencyKey: "transfer-key" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette si même clé mais wallet destinataire différent", async () => {
      transactions.findOne.mockResolvedValue({
        id: "existing-tx",
        idempotencyKey: "transfer-key",
        type: TransactionType.PLAYER_TRADE,
        amountBronze: "100",
        sourceWalletId: "aaa-w1",
        destinationWalletId: "bbb-w2",
      } as EconomicTransaction);

      await expect(
        service.transfer({ type: TransactionType.PLAYER_TRADE, sourceWalletId: "aaa-w1", destinationWalletId: "bbb-autre", amountBronze: 100n, idempotencyKey: "transfer-key" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejette si même clé mais type différent", async () => {
      transactions.findOne.mockResolvedValue({
        id: "existing-tx",
        idempotencyKey: "transfer-key",
        type: TransactionType.PLAYER_TRADE,
        amountBronze: "100",
        sourceWalletId: "aaa-w1",
        destinationWalletId: "bbb-w2",
      } as EconomicTransaction);

      await expect(
        service.transfer({ type: TransactionType.AUCTION_BUY, sourceWalletId: "aaa-w1", destinationWalletId: "bbb-w2", amountBronze: 100n, idempotencyKey: "transfer-key" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("lève NotFoundException si le wallet source est introuvable", async () => {
      const manager = makeManager({ "bbb-w2": makeWallet("bbb-w2", "0") });
      dataSource.transaction.mockImplementation(async (fn) => fn(manager));

      await expect(
        service.transfer({
          type: TransactionType.PLAYER_TRADE,
          sourceWalletId: "aaa-w1",
          destinationWalletId: "bbb-w2",
          amountBronze: 50n,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("conversion bigint", () => {
    it("gère correctement un grand solde (>= 2^53)", async () => {
      const largeBalance = "9007199254740993"; // 2^53 + 1 — dépasse Number.MAX_SAFE_INTEGER
      const wallet = makeWallet("w1", largeBalance);
      const manager = makeManager({ w1: wallet });
      dataSource.transaction.mockImplementation(async (fn) => fn(manager));

      await service.credit({
        type: TransactionType.ADMIN,
        destinationWalletId: "w1",
        amountBronze: 1n,
      });

      expect(manager.save).toHaveBeenCalledWith(
        Wallet,
        expect.objectContaining({ balanceBronze: "9007199254740994" }),
      );
    });

    it("getBalance retourne bigint pour un grand solde", async () => {
      wallets.findOneBy.mockResolvedValue(makeWallet("w1", "9007199254740993"));

      const balance = await service.getBalance("w1");

      expect(balance).toBe(9007199254740993n);
      expect(typeof balance).toBe("bigint");
    });
  });
});
