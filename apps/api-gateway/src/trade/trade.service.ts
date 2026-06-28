import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { InventoryEntryDto } from '../inventory/projection/inventory-entry.dto';
import { mapInstanceToEntry } from '../inventory/projection/inventory-entry.mapper';
import { TradeSession, TradeSessionState } from './entities/trade-session.entity';

const EMPTY_EQUIPPED_SETS = {
  equippedItemIds: new Set<string>(),
  equippedInstanceIds: new Set<string>(),
};

export interface TradeView {
  session: TradeSession;
  itemsA: InventoryEntryDto[];
  itemsB: InventoryEntryDto[];
}

@Injectable()
export class TradeService {
  constructor(
    @InjectRepository(TradeSession)
    private readonly sessions: Repository<TradeSession>,
    @InjectRepository(ItemInstance)
    private readonly instances: Repository<ItemInstance>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    private readonly dataSource: DataSource,
    private readonly itemTransfer: ItemTransferService,
  ) {}

  // ── Création ──────────────────────────────────────────────────────────────

  async createTrade(characterAId: string, targetCharacterId: string): Promise<TradeSession> {
    if (characterAId === targetCharacterId) {
      throw new BadRequestException('Cannot trade with yourself');
    }

    const session = this.sessions.create({
      characterAId,
      characterBId: targetCharacterId,
      state: TradeSessionState.PENDING,
      acceptedA: false,
      acceptedB: false,
    });
    return this.sessions.save(session);
  }

  // ── Lecture ───────────────────────────────────────────────────────────────

  async getTrade(characterId: string, tradeId: string): Promise<TradeView> {
    const session = await this.sessions.findOneBy({ id: tradeId });
    if (!session) throw new NotFoundException(`TradeSession ${tradeId} not found`);
    this.assertParticipant(session, characterId);

    const allItems = await this.instances.find({
      where: {
        containerType: ItemInstanceContainerType.TRADE,
        containerId: tradeId,
        state: ItemInstanceState.IN_TRADE,
      },
    });

    const itemIds = [...new Set(allItems.map((i) => i.itemId))];
    const itemList = itemIds.length > 0 ? await this.items.findBy({ id: In(itemIds) }) : [];
    const itemMap = new Map(itemList.map((it) => [it.id, it]));

    const toDto = (inst: ItemInstance): InventoryEntryDto | null => {
      const item = itemMap.get(inst.itemId);
      return item ? mapInstanceToEntry(inst, item, EMPTY_EQUIPPED_SETS) : null;
    };

    return {
      session,
      itemsA: allItems
        .filter((i) => i.ownerId === session.characterAId)
        .map(toDto)
        .filter((e): e is InventoryEntryDto => e !== null),
      itemsB: allItems
        .filter((i) => i.ownerId === session.characterBId)
        .map(toDto)
        .filter((e): e is InventoryEntryDto => e !== null),
    };
  }

  // ── Ajout d'objet ─────────────────────────────────────────────────────────

  async addItem(
    characterId: string,
    tradeId: string,
    itemInstanceId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, tradeId);
      this.assertParticipant(session, characterId);
      this.assertPending(session);

      const raw = await manager.findOne(ItemInstance, { where: { id: itemInstanceId } });
      if (!raw) throw new NotFoundException(`ItemInstance ${itemInstanceId} not found`);
      this.assertOwner(raw, characterId);
      this.assertTradeable(raw);

      // Toute modification des offres invalide les acceptances
      session.acceptedA = false;
      session.acceptedB = false;
      await manager.save(TradeSession, session);

      await this.itemTransfer.transfer(manager, itemInstanceId, {
        requesterId: characterId,
        transition: { type: 'TRADE_LOCK', tradeSessionId: tradeId },
      });
    });
  }

  // ── Retrait d'objet ───────────────────────────────────────────────────────

  async removeItem(
    characterId: string,
    tradeId: string,
    itemInstanceId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, tradeId);
      this.assertParticipant(session, characterId);
      this.assertPending(session);

      const raw = await manager.findOne(ItemInstance, { where: { id: itemInstanceId } });
      if (!raw) throw new NotFoundException(`ItemInstance ${itemInstanceId} not found`);
      this.assertOwner(raw, characterId);

      if (
        raw.state !== ItemInstanceState.IN_TRADE ||
        raw.containerType !== ItemInstanceContainerType.TRADE ||
        raw.containerId !== tradeId
      ) {
        throw new BadRequestException('Instance is not in this trade session');
      }

      session.acceptedA = false;
      session.acceptedB = false;
      await manager.save(TradeSession, session);

      await this.itemTransfer.transfer(manager, itemInstanceId, {
        requesterId: null,
        transition: { type: 'TRADE_CANCEL', tradeSessionId: tradeId },
      });
    });
  }

  // ── Accept ────────────────────────────────────────────────────────────────

  async accept(characterId: string, tradeId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, tradeId);
      this.assertParticipant(session, characterId);
      this.assertPending(session);

      const isA = session.characterAId === characterId;
      if (isA) {
        if (session.acceptedA) {
          throw new BadRequestException('Already accepted');
        }
        session.acceptedA = true;
      } else {
        if (session.acceptedB) {
          throw new BadRequestException('Already accepted');
        }
        session.acceptedB = true;
      }

      if (session.acceptedA && session.acceptedB) {
        await this.commitTrade(manager, session);
        session.state = TradeSessionState.COMPLETED;
      }

      await manager.save(TradeSession, session);
    });
  }

  // ── Annulation ────────────────────────────────────────────────────────────

  async cancel(characterId: string, tradeId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const session = await this.lockSession(manager, tradeId);
      this.assertParticipant(session, characterId);

      if (session.state === TradeSessionState.COMPLETED) {
        throw new BadRequestException('Cannot cancel a completed trade');
      }
      if (session.state === TradeSessionState.CANCELLED) {
        throw new BadRequestException('Trade is already cancelled');
      }

      await this.returnAllItems(manager, tradeId);

      session.state = TradeSessionState.CANCELLED;
      await manager.save(TradeSession, session);
    });
  }

  // ── Commit atomique ───────────────────────────────────────────────────────

  private async commitTrade(manager: EntityManager, session: TradeSession): Promise<void> {
    const allItems = await manager.find(ItemInstance, {
      where: {
        containerType: ItemInstanceContainerType.TRADE,
        containerId: session.id,
        state: ItemInstanceState.IN_TRADE,
      },
    });

    // Ordre déterministe par UUID — prévient les deadlocks entre commits concurrents
    const sorted = [...allItems].sort((a, b) => a.id.localeCompare(b.id));

    for (const inst of sorted) {
      // ownerId identifie le déposant → le destinataire est l'autre participant
      const recipient =
        inst.ownerId === session.characterAId
          ? session.characterBId
          : session.characterAId;

      await this.itemTransfer.transfer(manager, inst.id, {
        requesterId: null,
        transition: {
          type: 'TRADE_COMMIT',
          tradeSessionId: session.id,
          recipientCharacterId: recipient,
        },
      });
    }
  }

  private async returnAllItems(manager: EntityManager, tradeId: string): Promise<void> {
    const allItems = await manager.find(ItemInstance, {
      where: {
        containerType: ItemInstanceContainerType.TRADE,
        containerId: tradeId,
        state: ItemInstanceState.IN_TRADE,
      },
    });

    const sorted = [...allItems].sort((a, b) => a.id.localeCompare(b.id));

    for (const inst of sorted) {
      await this.itemTransfer.transfer(manager, inst.id, {
        requesterId: null,
        transition: { type: 'TRADE_CANCEL', tradeSessionId: tradeId },
      });
    }
  }

  // ── Helpers privés ────────────────────────────────────────────────────────

  private async lockSession(manager: EntityManager, tradeId: string): Promise<TradeSession> {
    const session = await manager
      .getRepository(TradeSession)
      .createQueryBuilder('t')
      .setLock('pessimistic_write')
      .where('t.id = :id', { id: tradeId })
      .getOne();
    if (!session) throw new NotFoundException(`TradeSession ${tradeId} not found`);
    return session;
  }

  private assertParticipant(session: TradeSession, characterId: string): void {
    if (session.characterAId !== characterId && session.characterBId !== characterId) {
      throw new ForbiddenException('You are not a participant in this trade');
    }
  }

  private assertPending(session: TradeSession): void {
    if (session.state !== TradeSessionState.PENDING) {
      throw new BadRequestException(`Trade is not pending (state: ${session.state})`);
    }
  }

  private assertOwner(instance: ItemInstance, characterId: string): void {
    if (instance.ownerId !== characterId) {
      throw new BadRequestException('Instance does not belong to this character');
    }
  }

  private assertTradeable(instance: ItemInstance): void {
    const blocked: ItemInstanceContainerType[] = [
      ItemInstanceContainerType.EQUIPMENT,
      ItemInstanceContainerType.AUCTION,
      ItemInstanceContainerType.WORLD,
      ItemInstanceContainerType.BANK,
      ItemInstanceContainerType.MAIL,
      ItemInstanceContainerType.GUILD_STORAGE,
      ItemInstanceContainerType.HOUSING,
      ItemInstanceContainerType.TRADE,
      ItemInstanceContainerType.CRAFT_ORDER,
    ];
    if (blocked.includes(instance.containerType)) {
      throw new BadRequestException(
        `Cannot add to trade: instance is in container ${instance.containerType}`,
      );
    }
  }
}
