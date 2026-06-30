import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThanOrEqual, Repository } from 'typeorm';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { InventoryEntryDto } from '../inventory/projection/inventory-entry.dto';
import { mapInstanceToEntry } from '../inventory/projection/inventory-entry.mapper';
import {
  MailMessage,
  MailStatus,
  MAIL_DEFAULT_TTL_DAYS,
} from './entities/mail-message.entity';
import { EconomyService } from '../economy/economy.service';
import { TransactionType } from '../economy/entities/economic-transaction.entity';

export const SYSTEM_SENDER_ID = 'SYSTEM';

const EMPTY_EQUIPPED_SETS = {
  equippedItemIds: new Set<string>(),
  equippedInstanceIds: new Set<string>(),
};

export interface SendMailInput {
  senderCharacterId: string;
  recipientCharacterId: string;
  subject: string;
  body?: string;
  itemInstanceId?: string;
}

export interface SystemMailInput {
  recipientCharacterId: string;
  subject: string;
  body?: string;
  attachedItemInstanceId?: string;
  attachedAmountBronze?: string;
}

export interface MailMessageDto {
  id: string;
  senderCharacterId: string;
  senderName: string;
  recipientCharacterId: string;
  subject: string;
  body: string;
  status: MailStatus;
  createdAt: Date;
  expiresAt: Date;
  claimedAt: Date | null;
  attachment: InventoryEntryDto | null;
  attachedAmountBronze: string | null;
  hasAttachment: boolean;
  claimed: boolean;
}

@Injectable()
export class MailService {
  constructor(
    @InjectRepository(MailMessage)
    private readonly messages: Repository<MailMessage>,
    @InjectRepository(ItemInstance)
    private readonly instances: Repository<ItemInstance>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    private readonly dataSource: DataSource,
    private readonly itemTransfer: ItemTransferService,
    private readonly economy: EconomyService,
  ) {}

  // ── Envoi ─────────────────────────────────────────────────────────────────

  async send(input: SendMailInput): Promise<MailMessage> {
    if (input.senderCharacterId === input.recipientCharacterId) {
      throw new BadRequestException('Cannot send mail to yourself');
    }
    if (input.subject.trim().length === 0) {
      throw new BadRequestException('Subject cannot be empty');
    }

    return this.dataSource.transaction(async (manager) => {
      if (input.itemInstanceId) {
        const raw = await manager.findOne(ItemInstance, {
          where: { id: input.itemInstanceId },
        });
        if (!raw) throw new NotFoundException(`ItemInstance ${input.itemInstanceId} not found`);
        this.assertOwner(raw, input.senderCharacterId);
        this.assertSendableContainer(raw);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + MAIL_DEFAULT_TTL_DAYS * 86400_000);

      const mail = manager.create(MailMessage, {
        senderCharacterId: input.senderCharacterId,
        recipientCharacterId: input.recipientCharacterId,
        subject: input.subject.trim(),
        body: input.body ?? '',
        attachedItemInstanceId: input.itemInstanceId ?? null,
        status: MailStatus.PENDING,
        createdAt: now,
        expiresAt,
        claimedAt: null,
      });
      const savedMail = await manager.save(MailMessage, mail);

      if (input.itemInstanceId) {
        await this.itemTransfer.transfer(manager, input.itemInstanceId, {
          requesterId: input.senderCharacterId,
          transition: { type: 'SEND_MAIL', mailId: savedMail.id },
        });
      }

      return savedMail;
    });
  }

  // ── Courrier système ──────────────────────────────────────────────────────

  async sendSystemMailWithinManager(
    manager: EntityManager,
    input: SystemMailInput,
  ): Promise<MailMessage> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MAIL_DEFAULT_TTL_DAYS * 86400_000);
    const mail = manager.create(MailMessage, {
      senderCharacterId: SYSTEM_SENDER_ID,
      recipientCharacterId: input.recipientCharacterId,
      subject: input.subject,
      body: input.body ?? '',
      attachedItemInstanceId: input.attachedItemInstanceId ?? null,
      attachedAmountBronze: input.attachedAmountBronze ?? null,
      status: MailStatus.PENDING,
      createdAt: now,
      expiresAt,
      claimedAt: null,
    });
    return manager.save(MailMessage, mail);
  }

  // ── Claim ─────────────────────────────────────────────────────────────────

  async claim(recipientCharacterId: string, mailId: string): Promise<void> {
    // Pré-résolution des wallets hors transaction (pour mails monétaires)
    const preview = await this.messages.findOne({ where: { id: mailId } });
    let escrowWalletId: string | null = null;
    let recipientWalletId: string | null = null;
    if (preview?.attachedAmountBronze) {
      const [escrow, recipient] = await Promise.all([
        this.economy.getOrCreateWallet('system', 'auction_escrow'),
        this.economy.getOrCreateWallet('character', recipientCharacterId),
      ]);
      escrowWalletId = escrow.id;
      recipientWalletId = recipient.id;
    }

    await this.dataSource.transaction(async (manager) => {
      const mail = await this.lockMessage(manager, mailId);

      if (mail.recipientCharacterId !== recipientCharacterId) {
        throw new BadRequestException('This mail does not belong to you');
      }
      if (mail.status !== MailStatus.PENDING) {
        throw new BadRequestException(`Cannot claim mail with status ${mail.status}`);
      }
      if (mail.expiresAt <= new Date()) {
        throw new BadRequestException('This mail has expired');
      }

      if (mail.attachedItemInstanceId) {
        await this.itemTransfer.transfer(manager, mail.attachedItemInstanceId, {
          requesterId: null,
          transition: {
            type: 'CLAIM_MAIL',
            mailId: mail.id,
            recipientCharacterId,
          },
        });
      } else if (mail.attachedAmountBronze && escrowWalletId && recipientWalletId) {
        await this.economy.transferWithinManager(manager, {
          type: TransactionType.AUCTION_SELL,
          sourceWalletId: escrowWalletId,
          destinationWalletId: recipientWalletId,
          amountBronze: BigInt(mail.attachedAmountBronze),
          correlationId: mail.id,
        });
      } else {
        throw new BadRequestException('This mail has no attachment to claim');
      }

      mail.status = MailStatus.CLAIMED;
      mail.claimedAt = new Date();
      await manager.save(MailMessage, mail);
    });
  }

  // ── Lecture ───────────────────────────────────────────────────────────────

  async listInbox(recipientCharacterId: string): Promise<MailMessageDto[]> {
    const mails = await this.messages.find({
      where: { recipientCharacterId, status: MailStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    return this.hydrateMessages(mails);
  }

  async listSent(senderCharacterId: string): Promise<MailMessageDto[]> {
    const mails = await this.messages.find({
      where: { senderCharacterId },
      order: { createdAt: 'DESC' },
    });
    return this.hydrateMessages(mails);
  }

  // ── Expiration ───────────────────────────────────────────────────────────

  /**
   * Politique d'expiration :
   * - Les mails PENDING sans pièce jointe sont marqués EXPIRED.
   * - Les mails PENDING avec pièce jointe non réclamée sont marqués RETURNED
   *   et l'ItemInstance revient dans l'inventaire de l'expéditeur via CLAIM_MAIL
   *   avec recipientCharacterId = senderCharacterId (retour au propriétaire légal
   *   déjà ownerId). ownerId ne change pas puisque l'expéditeur reste propriétaire
   *   légal pendant le transit.
   * - Aucune ItemInstance n'est supprimée.
   */
  async deleteExpired(now = new Date()): Promise<void> {
    const expiredMails = await this.messages.find({
      where: {
        status: MailStatus.PENDING,
        expiresAt: LessThanOrEqual(now),
      },
    });

    for (const mail of expiredMails) {
      try {
        await this.expireOneMail(mail.id);
      } catch {
        // Concurrent claim peut avoir changé le statut — on continue
      }
    }
  }

  private async expireOneMail(mailId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const mail = await this.lockMessage(manager, mailId);

      if (mail.status !== MailStatus.PENDING) return;

      if (mail.attachedItemInstanceId) {
        // Retour en inventaire expéditeur : ownerId reste l'expéditeur
        await this.itemTransfer.transfer(manager, mail.attachedItemInstanceId, {
          requesterId: null,
          transition: {
            type: 'CLAIM_MAIL',
            mailId: mail.id,
            recipientCharacterId: mail.senderCharacterId,
          },
        });
        mail.status = MailStatus.RETURNED;
      } else {
        mail.status = MailStatus.EXPIRED;
      }

      await manager.save(MailMessage, mail);
    });
  }

  // ── Helpers privés ────────────────────────────────────────────────────────

  private async lockMessage(manager: EntityManager, mailId: string): Promise<MailMessage> {
    const mail = await manager
      .getRepository(MailMessage)
      .createQueryBuilder('m')
      .setLock('pessimistic_write')
      .where('m.id = :id', { id: mailId })
      .getOne();
    if (!mail) throw new NotFoundException(`MailMessage ${mailId} not found`);
    return mail;
  }

  private assertOwner(instance: ItemInstance, characterId: string): void {
    if (instance.ownerId !== characterId) {
      throw new BadRequestException('Instance does not belong to this character');
    }
  }

  private assertSendableContainer(instance: ItemInstance): void {
    const blocked: ItemInstanceContainerType[] = [
      ItemInstanceContainerType.EQUIPMENT,
      ItemInstanceContainerType.AUCTION,
      ItemInstanceContainerType.WORLD,
      ItemInstanceContainerType.BANK,
      ItemInstanceContainerType.MAIL,
      ItemInstanceContainerType.GUILD_STORAGE,
      ItemInstanceContainerType.CRAFT_ORDER,
    ];
    if (blocked.includes(instance.containerType)) {
      throw new BadRequestException(
        `Cannot send: instance is in container ${instance.containerType}`,
      );
    }
  }

  private async hydrateMessages(mails: MailMessage[]): Promise<MailMessageDto[]> {
    if (mails.length === 0) return [];

    const attachedIds = mails
      .map((m) => m.attachedItemInstanceId)
      .filter((id): id is string => id !== null);

    let instanceItemMap = new Map<string, { instance: ItemInstance; item: Item }>();

    if (attachedIds.length > 0) {
      const instances = await this.instances.findBy({ id: In(attachedIds) });
      const itemIds = [...new Set(instances.map((i) => i.itemId))];
      const itemList = await this.items.findBy({ id: In(itemIds) });
      const itemMap = new Map(itemList.map((it) => [it.id, it]));
      for (const inst of instances) {
        const item = itemMap.get(inst.itemId);
        if (item) instanceItemMap.set(inst.id, { instance: inst, item });
      }
    }

    return mails.map((mail) => {
      let attachment: InventoryEntryDto | null = null;
      if (mail.attachedItemInstanceId) {
        const entry = instanceItemMap.get(mail.attachedItemInstanceId);
        if (entry) {
          attachment = mapInstanceToEntry(entry.instance, entry.item, EMPTY_EQUIPPED_SETS);
        }
      }
      return {
        id: mail.id,
        senderCharacterId: mail.senderCharacterId,
        senderName: mail.senderCharacterId === SYSTEM_SENDER_ID ? 'Système' : mail.senderCharacterId,
        recipientCharacterId: mail.recipientCharacterId,
        subject: mail.subject,
        body: mail.body,
        status: mail.status,
        createdAt: mail.createdAt,
        expiresAt: mail.expiresAt,
        claimedAt: mail.claimedAt,
        attachment,
        attachedAmountBronze: mail.attachedAmountBronze,
        hasAttachment: mail.attachedItemInstanceId !== null || mail.attachedAmountBronze !== null,
        claimed: mail.status === MailStatus.CLAIMED,
      };
    });
  }
}
