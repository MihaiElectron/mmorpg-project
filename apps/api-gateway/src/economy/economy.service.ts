import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Wallet, WalletStatus } from './entities/wallet.entity';
import {
  EconomicTransaction,
  TransactionStatus,
  TransactionType,
} from './entities/economic-transaction.entity';
import { LedgerDirection, LedgerEntry } from './entities/ledger-entry.entity';

export interface CreditParams {
  type: TransactionType;
  destinationWalletId: string;
  amountBronze: bigint;
  sourceWalletId?: string | null;
  idempotencyKey?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface DebitParams {
  type: TransactionType;
  sourceWalletId: string;
  amountBronze: bigint;
  destinationWalletId?: string | null;
  idempotencyKey?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TransferParams {
  type: TransactionType;
  sourceWalletId: string;
  destinationWalletId: string;
  amountBronze: bigint;
  idempotencyKey?: string | null;
  actorId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class EconomyService {
  constructor(
    @InjectRepository(Wallet)
    private readonly wallets: Repository<Wallet>,
    @InjectRepository(EconomicTransaction)
    private readonly transactions: Repository<EconomicTransaction>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntries: Repository<LedgerEntry>,
    private readonly dataSource: DataSource,
  ) {}

  async getOrCreateWallet(ownerType: string, ownerId: string): Promise<Wallet> {
    const existing = await this.wallets.findOne({ where: { ownerType, ownerId } });
    if (existing) return existing;
    const wallet = this.wallets.create({
      ownerType,
      ownerId,
      balanceBronze: '0',
      status: WalletStatus.ACTIVE,
    });
    return this.wallets.save(wallet);
  }

  async getBalance(walletId: string): Promise<bigint> {
    const wallet = await this.wallets.findOneBy({ id: walletId });
    if (!wallet) throw new NotFoundException(`Wallet ${walletId} not found`);
    return BigInt(wallet.balanceBronze);
  }

  async credit(params: CreditParams): Promise<EconomicTransaction> {
    this.assertPositiveAmount(params.amountBronze);

    if (params.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(params.idempotencyKey);
      if (existing) {
        this.assertIdempotentCompatibility(existing, {
          type: params.type,
          amountBronze: params.amountBronze,
          sourceWalletId: params.sourceWalletId ?? null,
          destinationWalletId: params.destinationWalletId,
        });
        return existing;
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.lockWallet(manager, params.destinationWalletId);
      this.assertWalletOperable(wallet);

      const newBalance = BigInt(wallet.balanceBronze) + params.amountBronze;
      wallet.balanceBronze = newBalance.toString();
      await manager.save(Wallet, wallet);

      const tx = manager.create(EconomicTransaction, {
        type: params.type,
        status: TransactionStatus.APPLIED,
        sourceWalletId: params.sourceWalletId ?? null,
        destinationWalletId: params.destinationWalletId,
        amountBronze: params.amountBronze.toString(),
        idempotencyKey: params.idempotencyKey ?? null,
        actorId: params.actorId ?? null,
        correlationId: params.correlationId ?? null,
        metadata: params.metadata ?? null,
        committedAt: new Date(),
      });
      const savedTx = await manager.save(EconomicTransaction, tx);

      await manager.save(
        LedgerEntry,
        manager.create(LedgerEntry, {
          transactionId: savedTx.id,
          walletId: params.destinationWalletId,
          direction: LedgerDirection.CREDIT,
          amountBronze: params.amountBronze.toString(),
          balanceAfterBronze: newBalance.toString(),
          entryType: params.type,
          metadata: params.metadata ?? null,
        }),
      );

      return savedTx;
    });
  }

  async debit(params: DebitParams): Promise<EconomicTransaction> {
    this.assertPositiveAmount(params.amountBronze);

    if (params.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(params.idempotencyKey);
      if (existing) {
        this.assertIdempotentCompatibility(existing, {
          type: params.type,
          amountBronze: params.amountBronze,
          sourceWalletId: params.sourceWalletId,
          destinationWalletId: params.destinationWalletId ?? null,
        });
        return existing;
      }
    }

    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.lockWallet(manager, params.sourceWalletId);
      this.assertWalletOperable(wallet);

      const currentBalance = BigInt(wallet.balanceBronze);
      if (currentBalance < params.amountBronze) {
        throw new BadRequestException('Solde insuffisant');
      }

      const newBalance = currentBalance - params.amountBronze;
      wallet.balanceBronze = newBalance.toString();
      await manager.save(Wallet, wallet);

      const tx = manager.create(EconomicTransaction, {
        type: params.type,
        status: TransactionStatus.APPLIED,
        sourceWalletId: params.sourceWalletId,
        destinationWalletId: params.destinationWalletId ?? null,
        amountBronze: params.amountBronze.toString(),
        idempotencyKey: params.idempotencyKey ?? null,
        actorId: params.actorId ?? null,
        correlationId: params.correlationId ?? null,
        metadata: params.metadata ?? null,
        committedAt: new Date(),
      });
      const savedTx = await manager.save(EconomicTransaction, tx);

      await manager.save(
        LedgerEntry,
        manager.create(LedgerEntry, {
          transactionId: savedTx.id,
          walletId: params.sourceWalletId,
          direction: LedgerDirection.DEBIT,
          amountBronze: params.amountBronze.toString(),
          balanceAfterBronze: newBalance.toString(),
          entryType: params.type,
          metadata: params.metadata ?? null,
        }),
      );

      return savedTx;
    });
  }

  async transfer(params: TransferParams): Promise<EconomicTransaction> {
    this.assertPositiveAmount(params.amountBronze);

    if (params.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(params.idempotencyKey);
      if (existing) {
        this.assertIdempotentCompatibility(existing, {
          type: params.type,
          amountBronze: params.amountBronze,
          sourceWalletId: params.sourceWalletId,
          destinationWalletId: params.destinationWalletId,
        });
        return existing;
      }
    }

    return this.dataSource.transaction(async (manager) => {
      return this.transferWithinManager(manager, params);
    });
  }

  /**
   * Transfère des fonds dans un EntityManager fourni par l'appelant.
   * L'appelant est responsable d'ouvrir la transaction.
   * Pas de vérification d'idempotence — l'appelant gère la protection contre les replays.
   */
  async transferWithinManager(
    manager: EntityManager,
    params: TransferParams,
  ): Promise<EconomicTransaction> {
    this.assertPositiveAmount(params.amountBronze);

    // Verrous dans l'ordre déterministe pour éviter les deadlocks
    const ids = [params.sourceWalletId, params.destinationWalletId].sort();
    const walletMap = new Map<string, Wallet>();
    for (const id of ids) {
      walletMap.set(id, await this.lockWallet(manager, id));
    }

    const sourceWallet = walletMap.get(params.sourceWalletId)!;
    const destWallet = walletMap.get(params.destinationWalletId)!;
    this.assertWalletOperable(sourceWallet);
    this.assertWalletOperable(destWallet);

    const sourceBalance = BigInt(sourceWallet.balanceBronze);
    if (sourceBalance < params.amountBronze) {
      throw new BadRequestException('Solde insuffisant');
    }

    const newSourceBalance = sourceBalance - params.amountBronze;
    const newDestBalance = BigInt(destWallet.balanceBronze) + params.amountBronze;

    sourceWallet.balanceBronze = newSourceBalance.toString();
    destWallet.balanceBronze = newDestBalance.toString();
    await manager.save(Wallet, sourceWallet);
    await manager.save(Wallet, destWallet);

    const tx = manager.create(EconomicTransaction, {
      type: params.type,
      status: TransactionStatus.APPLIED,
      sourceWalletId: params.sourceWalletId,
      destinationWalletId: params.destinationWalletId,
      amountBronze: params.amountBronze.toString(),
      idempotencyKey: params.idempotencyKey ?? null,
      actorId: params.actorId ?? null,
      correlationId: params.correlationId ?? null,
      metadata: params.metadata ?? null,
      committedAt: new Date(),
    });
    const savedTx = await manager.save(EconomicTransaction, tx);

    await manager.save(
      LedgerEntry,
      manager.create(LedgerEntry, {
        transactionId: savedTx.id,
        walletId: params.sourceWalletId,
        direction: LedgerDirection.DEBIT,
        amountBronze: params.amountBronze.toString(),
        balanceAfterBronze: newSourceBalance.toString(),
        entryType: params.type,
        metadata: params.metadata ?? null,
      }),
    );

    await manager.save(
      LedgerEntry,
      manager.create(LedgerEntry, {
        transactionId: savedTx.id,
        walletId: params.destinationWalletId,
        direction: LedgerDirection.CREDIT,
        amountBronze: params.amountBronze.toString(),
        balanceAfterBronze: newDestBalance.toString(),
        entryType: params.type,
        metadata: params.metadata ?? null,
      }),
    );

    return savedTx;
  }

  private assertIdempotentCompatibility(
    existing: EconomicTransaction,
    expected: {
      type: TransactionType;
      amountBronze: bigint;
      sourceWalletId: string | null;
      destinationWalletId: string | null;
    },
  ): void {
    const mismatch =
      existing.type !== expected.type ||
      BigInt(existing.amountBronze) !== expected.amountBronze ||
      existing.sourceWalletId !== expected.sourceWalletId ||
      existing.destinationWalletId !== expected.destinationWalletId;

    if (mismatch) {
      throw new BadRequestException(
        `Clé d'idempotence déjà utilisée avec un payload incompatible (id: ${existing.id})`,
      );
    }
  }

  private async lockWallet(manager: EntityManager, walletId: string): Promise<Wallet> {
    const wallet = await manager
      .getRepository(Wallet)
      .createQueryBuilder('wallet')
      .setLock('pessimistic_write')
      .where('wallet.id = :id', { id: walletId })
      .getOne();
    if (!wallet) throw new NotFoundException(`Wallet ${walletId} introuvable`);
    return wallet;
  }

  private assertWalletOperable(wallet: Wallet): void {
    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException(
        `Wallet ${wallet.id} non opérable (statut: ${wallet.status})`,
      );
    }
  }

  private assertPositiveAmount(amount: bigint): void {
    if (amount <= 0n) {
      throw new BadRequestException('Le montant doit être strictement positif');
    }
  }

  private async findByIdempotencyKey(key: string): Promise<EconomicTransaction | null> {
    return this.transactions.findOne({ where: { idempotencyKey: key } });
  }
}
