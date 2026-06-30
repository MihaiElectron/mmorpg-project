import { BadRequestException } from "@nestjs/common";
import { MailController } from "./mail.controller";
import { BuildingType } from "../buildings/enums/building-type.enum";
import { BuildingState } from "../buildings/enums/building-state.enum";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHARACTER = { id: "char-1", worldX: 500, worldY: 500, mapId: 1 };

function makeActiveMailbox(overrides: Record<string, unknown> = {}) {
  return {
    id: "mbx-1",
    worldX: 500,
    worldY: 500,
    mapId: 1,
    state: BuildingState.ACTIVE,
    template: {
      buildingType: BuildingType.MAILBOX,
      enabled: true,
      interactionRadiusWU: 1536,
    },
    ...overrides,
  };
}

function makeController(buildingOverrides?: Record<string, unknown> | null) {
  const characterService = {
    findFirstByUser: jest.fn().mockResolvedValue(CHARACTER),
  };
  const buildingsService = {
    findBuildingById: jest.fn().mockResolvedValue(
      buildingOverrides === null ? null : makeActiveMailbox(buildingOverrides),
    ),
  };
  const worldService = {
    validateInteraction: jest.fn().mockReturnValue(null),
    getConnectedPlayerByCharacterId: jest.fn().mockReturnValue(null),
  };
  const mailService = {
    listInbox: jest.fn().mockResolvedValue([]),
    listSent: jest.fn().mockResolvedValue([]),
    send: jest.fn().mockResolvedValue({}),
    claim: jest.fn().mockResolvedValue(undefined),
  };

  const ctrl = new MailController(
    mailService as any,
    characterService as any,
    buildingsService as any,
    worldService as any,
  );

  return { ctrl, characterService, buildingsService, worldService, mailService };
}

const REQ = { user: { userId: "user-1" } };

// ── buildingId obligatoire ────────────────────────────────────────────────────

describe("MailController — buildingId obligatoire", () => {
  it("inbox : lève BadRequestException si buildingId absent", async () => {
    const { ctrl } = makeController();
    await expect(ctrl.listInbox(REQ as any, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("inbox : appelle mailService.listInbox si buildingId présent", async () => {
    const { ctrl, mailService } = makeController();
    await ctrl.listInbox(REQ as any, "mbx-1");
    expect(mailService.listInbox).toHaveBeenCalledWith(CHARACTER.id);
  });

  it("send : lève BadRequestException si buildingId absent", async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.send(REQ as any, {
        recipientCharacterId: "char-2",
        subject: "Bonjour",
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("send : appelle mailService.send si buildingId présent", async () => {
    const { ctrl, mailService } = makeController();
    await ctrl.send(REQ as any, {
      buildingId: "mbx-1",
      recipientCharacterId: "char-2",
      subject: "Bonjour",
    } as any);
    expect(mailService.send).toHaveBeenCalled();
  });

  it("claim : lève BadRequestException si buildingId absent", async () => {
    const { ctrl } = makeController();
    await expect(ctrl.claim(REQ as any, "mail-1", {} as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("claim : appelle mailService.claim si buildingId présent", async () => {
    const { ctrl, mailService } = makeController();
    await ctrl.claim(REQ as any, "mail-1", { buildingId: "mbx-1" });
    expect(mailService.claim).toHaveBeenCalledWith(CHARACTER.id, "mail-1");
  });
});

// ── mauvais buildingType refusé ────────────────────────────────────────────────

describe("MailController — validation buildingType", () => {
  it("inbox : refuse si buildingType !== MAILBOX", async () => {
    const { ctrl } = makeController({
      template: { buildingType: BuildingType.AUCTION_HOUSE, enabled: true, interactionRadiusWU: 2048 },
    });
    await expect(ctrl.listInbox(REQ as any, "mbx-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("claim : refuse si buildingType !== MAILBOX", async () => {
    const { ctrl } = makeController({
      template: { buildingType: BuildingType.BANK, enabled: true, interactionRadiusWU: 2048 },
    });
    await expect(ctrl.claim(REQ as any, "mail-1", { buildingId: "mbx-1" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── building inactif ou désactivé refusé ──────────────────────────────────────

describe("MailController — validation état building", () => {
  it("refuse si building.state !== ACTIVE", async () => {
    const { ctrl } = makeController({ state: BuildingState.LOCKED });
    await expect(ctrl.claim(REQ as any, "mail-1", { buildingId: "mbx-1" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si template.enabled === false", async () => {
    const { ctrl } = makeController({
      template: { buildingType: BuildingType.MAILBOX, enabled: false, interactionRadiusWU: 1536 },
    });
    await expect(ctrl.listInbox(REQ as any, "mbx-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si building introuvable (findBuildingById retourne null)", async () => {
    const { ctrl } = makeController(null);
    await expect(ctrl.claim(REQ as any, "mail-1", { buildingId: "mbx-inexistant" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── building hors portée refusé ───────────────────────────────────────────────

describe("MailController — validation distance", () => {
  it("claim : refuse si validateInteraction retourne une erreur", async () => {
    const { ctrl, worldService } = makeController();
    worldService.validateInteraction.mockReturnValue("Trop loin (distance=9999 WU, rayon=1536 WU).");
    await expect(ctrl.claim(REQ as any, "mail-1", { buildingId: "mbx-1" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("inbox : refuse si validateInteraction retourne une erreur", async () => {
    const { ctrl, worldService } = makeController();
    worldService.validateInteraction.mockReturnValue("Carte différente.");
    await expect(ctrl.listInbox(REQ as any, "mbx-1")).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── double claim — géré par mailService ──────────────────────────────────────

describe("MailController — double claim refusé", () => {
  it("claim : laisse mailService.claim rejeter si déjà réclamé", async () => {
    const { ctrl, mailService } = makeController();
    mailService.claim.mockRejectedValue(new BadRequestException("Pièce jointe déjà récupérée."));
    await expect(ctrl.claim(REQ as any, "mail-1", { buildingId: "mbx-1" })).rejects.toBeInstanceOf(BadRequestException);
  });
});
