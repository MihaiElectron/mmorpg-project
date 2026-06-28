import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from "../item-instances/entities/item-instance.entity";
import { Item } from "../items/entities/item.entity";
import { ItemTransferService } from "../item-transfer/item-transfer.service";
import { MailMessage, MailStatus } from "./entities/mail-message.entity";
import { MailService } from "./mail.service";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(): Item {
  return { id: "item-1", name: "Épée", type: "weapon", category: "equipment", image: null } as Item;
}

function makeInstance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: "inst-1",
    itemId: "item-1",
    ownerId: "sender-1",
    ownerType: "character",
    state: ItemInstanceState.AVAILABLE,
    containerType: ItemInstanceContainerType.INVENTORY,
    containerId: "sender-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ItemInstance;
}

function makeMail(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: "mail-1",
    senderCharacterId: "sender-1",
    recipientCharacterId: "recipient-1",
    subject: "Cadeau",
    body: "",
    attachedItemInstanceId: "inst-1",
    status: MailStatus.PENDING,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400_000 * 30),
    claimedAt: null,
    ...overrides,
  } as MailMessage;
}

function makeMailsRepo(mail: MailMessage | null = null, mails: MailMessage[] = []) {
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(mail),
  };
  return {
    find: jest.fn().mockResolvedValue(mails),
    findBy: jest.fn().mockResolvedValue([]),
    create: jest.fn((_E: unknown, data: unknown) => ({ ...(data as object) })),
    save: jest.fn(async (_E: unknown, data: unknown) => ({ id: "mail-1", ...(data as object) })),
    createQueryBuilder: jest.fn(() => qb),
    _qb: qb,
  };
}

function makeInstancesRepo(instances: ItemInstance[] = []) {
  return { findBy: jest.fn().mockResolvedValue(instances) };
}

function makeItemsRepo(items: Item[] = [makeItem()]) {
  return { findBy: jest.fn().mockResolvedValue(items) };
}

function makeTransfer() {
  return { transfer: jest.fn().mockResolvedValue({} as ItemInstance) };
}

function makeManager(instance: ItemInstance | null, mail: MailMessage | null = null) {
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(mail),
  };
  return {
    findOne: jest.fn().mockResolvedValue(instance),
    getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn(() => qb) }),
    create: jest.fn((_E: unknown, data: unknown) => ({ ...(data as object) })),
    save: jest.fn(async (_E: unknown, data: unknown) => ({ id: "mail-1", ...(data as object) })),
  } as unknown as EntityManager;
}

function buildService(
  instance: ItemInstance | null,
  mail: MailMessage | null = null,
  inboxMails: MailMessage[] = [],
  instances: ItemInstance[] = [],
  items: Item[] = [makeItem()],
) {
  const mailsRepo = makeMailsRepo(mail, inboxMails);
  const instancesRepo = makeInstancesRepo(instances);
  const itemsRepo = makeItemsRepo(items);
  const itemTransfer = makeTransfer();

  const dataSource = {
    transaction: jest.fn(async (fn: (mgr: EntityManager) => unknown) =>
      fn(makeManager(instance, mail)),
    ),
  };

  const service = new MailService(
    mailsRepo as unknown as Repository<MailMessage>,
    instancesRepo as unknown as Repository<ItemInstance>,
    itemsRepo as unknown as Repository<Item>,
    dataSource as unknown as DataSource,
    itemTransfer as unknown as ItemTransferService,
  );

  return { service, itemTransfer, dataSource, mailsRepo };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("MailService", () => {

  // ── send ──────────────────────────────────────────────────────────────────

  describe("send", () => {
    it("cree un mail et appelle SEND_MAIL si piece jointe", async () => {
      const instance = makeInstance();
      const { service, itemTransfer } = buildService(instance);

      await service.send({
        senderCharacterId: "sender-1",
        recipientCharacterId: "recipient-1",
        subject: "Cadeau",
        body: "",
        itemInstanceId: "inst-1",
      });

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({ transition: expect.objectContaining({ type: "SEND_MAIL" }) }),
      );
    });

    it("cree un mail sans piece jointe sans appeler ItemTransferService", async () => {
      const { service, itemTransfer } = buildService(null);

      await service.send({
        senderCharacterId: "sender-1",
        recipientCharacterId: "recipient-1",
        subject: "Bonjour",
        body: "Message simple",
      });

      expect(itemTransfer.transfer).not.toHaveBeenCalled();
    });

    it("refuse l auto-envoi", async () => {
      const { service } = buildService(null);
      await expect(
        service.send({
          senderCharacterId: "char-1",
          recipientCharacterId: "char-1",
          subject: "Test",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si sujet vide", async () => {
      const { service } = buildService(null);
      await expect(
        service.send({
          senderCharacterId: "sender-1",
          recipientCharacterId: "recipient-1",
          subject: "  ",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si instance inexistante", async () => {
      const { service } = buildService(null);
      await expect(
        service.send({
          senderCharacterId: "sender-1",
          recipientCharacterId: "recipient-1",
          subject: "Test",
          itemInstanceId: "ghost",
        })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuse si instance n appartient pas a l expediteur", async () => {
      const instance = makeInstance({ ownerId: "autre" });
      const { service } = buildService(instance);
      await expect(
        service.send({
          senderCharacterId: "sender-1",
          recipientCharacterId: "recipient-1",
          subject: "Test",
          itemInstanceId: "inst-1",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si instance en Auction", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.LISTED,
        containerType: ItemInstanceContainerType.AUCTION,
        containerId: "listing-1",
      });
      const { service } = buildService(instance);
      await expect(
        service.send({
          senderCharacterId: "sender-1",
          recipientCharacterId: "recipient-1",
          subject: "Test",
          itemInstanceId: "inst-1",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si instance en Bank", async () => {
      const instance = makeInstance({
        state: ItemInstanceState.IN_BANK,
        containerType: ItemInstanceContainerType.BANK,
      });
      const { service } = buildService(instance);
      await expect(
        service.send({
          senderCharacterId: "sender-1",
          recipientCharacterId: "recipient-1",
          subject: "Test",
          itemInstanceId: "inst-1",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("propage l erreur si ItemTransferService rejette (rollback)", async () => {
      const instance = makeInstance();
      const { service, itemTransfer } = buildService(instance);
      itemTransfer.transfer.mockRejectedValue(new BadRequestException("etat invalide"));
      await expect(
        service.send({
          senderCharacterId: "sender-1",
          recipientCharacterId: "recipient-1",
          subject: "Test",
          itemInstanceId: "inst-1",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── claim ──────────────────────────────────────────────────────────────────

  describe("claim", () => {
    it("appelle CLAIM_MAIL et met le statut a CLAIMED", async () => {
      const mail = makeMail();
      const { service, itemTransfer } = buildService(null, mail);

      await service.claim("recipient-1", "mail-1");

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({
          transition: expect.objectContaining({ type: "CLAIM_MAIL", recipientCharacterId: "recipient-1" }),
        }),
      );
    });

    it("leve NotFoundException si courrier inexistant", async () => {
      const { service } = buildService(null, null);
      await expect(service.claim("recipient-1", "ghost")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuse si ce n est pas le destinataire", async () => {
      const mail = makeMail({ recipientCharacterId: "recipient-1" });
      const { service } = buildService(null, mail);
      await expect(service.claim("autre", "mail-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse le double claim (statut != PENDING)", async () => {
      const mail = makeMail({ status: MailStatus.CLAIMED });
      const { service } = buildService(null, mail);
      await expect(service.claim("recipient-1", "mail-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si courrier expire", async () => {
      const mail = makeMail({ expiresAt: new Date(Date.now() - 1000) });
      const { service } = buildService(null, mail);
      await expect(service.claim("recipient-1", "mail-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse si aucune piece jointe", async () => {
      const mail = makeMail({ attachedItemInstanceId: null });
      const { service } = buildService(null, mail);
      await expect(service.claim("recipient-1", "mail-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("pose un verrou pessimiste via lockMessage avant d appeler le transfert", async () => {
      const mail = makeMail();
      const { service, itemTransfer } = buildService(null, mail);
      await service.claim("recipient-1", "mail-1");
      // lockMessage réussit (NotFoundException non levée) et le transfert est appelé
      expect(itemTransfer.transfer).toHaveBeenCalledTimes(1);
    });
  });

  // ── listInbox / listSent ──────────────────────────────────────────────────

  describe("listInbox", () => {
    it("retourne les messages en attente pour le destinataire", async () => {
      const mail = makeMail({ attachedItemInstanceId: null });
      const { service } = buildService(null, null, [mail]);

      const result = await service.listInbox("recipient-1");
      expect(result).toHaveLength(1);
      expect(result[0].subject).toBe("Cadeau");
      expect(result[0].attachment).toBeNull();
    });
  });

  describe("listSent", () => {
    it("retourne les messages envoyes par l expediteur", async () => {
      const mail = makeMail({ attachedItemInstanceId: null });
      const { service, mailsRepo } = buildService(null, null, [mail]);
      mailsRepo.find.mockResolvedValue([mail]);

      const result = await service.listSent("sender-1");
      expect(result).toHaveLength(1);
    });
  });

  // ── deleteExpired ─────────────────────────────────────────────────────────

  describe("deleteExpired", () => {
    it("marque RETURNED les mails expires avec piece jointe et appelle CLAIM_MAIL", async () => {
      const mail = makeMail({ expiresAt: new Date(Date.now() - 1000) });
      const { service, itemTransfer, mailsRepo } = buildService(null, mail, [mail]);
      mailsRepo.find.mockResolvedValue([mail]);

      await service.deleteExpired();

      expect(itemTransfer.transfer).toHaveBeenCalledWith(
        expect.anything(),
        "inst-1",
        expect.objectContaining({
          transition: expect.objectContaining({ type: "CLAIM_MAIL", recipientCharacterId: "sender-1" }),
        }),
      );
    });

    it("marque EXPIRED les mails expires sans piece jointe", async () => {
      const mail = makeMail({ expiresAt: new Date(Date.now() - 1000), attachedItemInstanceId: null });
      const { service, itemTransfer, mailsRepo } = buildService(null, mail, [mail]);
      mailsRepo.find.mockResolvedValue([mail]);

      await service.deleteExpired();

      expect(itemTransfer.transfer).not.toHaveBeenCalled();
    });

    it("ignore les mails deja traites (idempotence)", async () => {
      const mail = makeMail({ status: MailStatus.CLAIMED, expiresAt: new Date(Date.now() - 1000) });
      const { service, itemTransfer, mailsRepo } = buildService(null, mail, [mail]);
      mailsRepo.find.mockResolvedValue([mail]);

      await service.deleteExpired();

      expect(itemTransfer.transfer).not.toHaveBeenCalled();
    });
  });
});
