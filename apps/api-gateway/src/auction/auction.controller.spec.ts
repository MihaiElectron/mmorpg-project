import { BadRequestException } from "@nestjs/common";
import { AuctionController } from "./auction.controller";
import { BuildingType } from "../buildings/enums/building-type.enum";
import { BuildingState } from "../buildings/enums/building-state.enum";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHARACTER = { id: "char-1", worldX: 1000, worldY: 1000, mapId: 1 };

function makeActiveBuilding(overrides: Record<string, unknown> = {}) {
  return {
    id: "bld-1",
    worldX: 1000,
    worldY: 1000,
    mapId: 1,
    state: BuildingState.ACTIVE,
    template: {
      buildingType: BuildingType.AUCTION_HOUSE,
      enabled: true,
      interactionRadiusWU: 2048,
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
      buildingOverrides === null ? null : makeActiveBuilding(buildingOverrides),
    ),
  };
  const worldService = {
    validateInteraction: jest.fn().mockReturnValue(null),
  };
  const auctionService = {
    getActiveListings: jest.fn().mockResolvedValue([]),
    getSellerListings: jest.fn().mockResolvedValue([]),
    getBuyerPendingListings: jest.fn().mockResolvedValue([]),
    createListing: jest.fn().mockResolvedValue({}),
    buyListing: jest.fn().mockResolvedValue({}),
    cancelListing: jest.fn().mockResolvedValue({}),
  };

  const ctrl = new AuctionController(
    auctionService as any,
    characterService as any,
    buildingsService as any,
    worldService as any,
  );

  return { ctrl, characterService, buildingsService, worldService, auctionService };
}

const REQ = { user: { userId: "user-1" } };

// ── buildingId obligatoire sur les mutations sensibles ────────────────────────

describe("AuctionController — buildingId obligatoire", () => {
  it("createListing : valide le building si buildingId présent", async () => {
    const { ctrl, buildingsService } = makeController();
    await ctrl.createListing(REQ as any, {
      buildingId: "bld-1",
      itemInstanceId: "inst-1",
      buyoutPriceBronze: 100,
      durationHours: 24,
    });
    expect(buildingsService.findBuildingById).toHaveBeenCalledWith("bld-1");
  });

  it("buyListing : lève BadRequestException si buildingId absent", async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.buyListing(REQ as any, "lst-1", {} as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("buyListing : valide le building si buildingId présent", async () => {
    const { ctrl, buildingsService } = makeController();
    await ctrl.buyListing(REQ as any, "lst-1", { buildingId: "bld-1" });
    expect(buildingsService.findBuildingById).toHaveBeenCalledWith("bld-1");
  });

});

// ── mauvais buildingType refusé ────────────────────────────────────────────────

describe("AuctionController — validation buildingType", () => {
  it("createListing : refuse si buildingType !== AUCTION_HOUSE", async () => {
    const { ctrl } = makeController({
      template: { buildingType: BuildingType.MAILBOX, enabled: true, interactionRadiusWU: 1536 },
    });
    await expect(
      ctrl.createListing(REQ as any, {
        buildingId: "bld-1",
        itemInstanceId: "inst-1",
        buyoutPriceBronze: 100,
        durationHours: 24,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("buyListing : refuse si buildingType !== AUCTION_HOUSE", async () => {
    const { ctrl } = makeController({
      template: { buildingType: BuildingType.BANK, enabled: true, interactionRadiusWU: 2048 },
    });
    await expect(
      ctrl.buyListing(REQ as any, "lst-1", { buildingId: "bld-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── building inactif ou désactivé refusé ──────────────────────────────────────

describe("AuctionController — validation état building", () => {
  it("refuse si building.state !== ACTIVE", async () => {
    const { ctrl } = makeController({ state: BuildingState.DISABLED });
    await expect(
      ctrl.buyListing(REQ as any, "lst-1", { buildingId: "bld-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si template.enabled === false", async () => {
    const { ctrl } = makeController({
      template: { buildingType: BuildingType.AUCTION_HOUSE, enabled: false, interactionRadiusWU: 2048 },
    });
    await expect(
      ctrl.buyListing(REQ as any, "lst-1", { buildingId: "bld-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuse si building introuvable (findBuildingById retourne null)", async () => {
    const { ctrl } = makeController(null);
    await expect(
      ctrl.createListing(REQ as any, {
        buildingId: "bld-inexistant",
        itemInstanceId: "inst-1",
        buyoutPriceBronze: 100,
        durationHours: 24,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── building hors portée refusé ───────────────────────────────────────────────

describe("AuctionController — validation distance (validateInteraction)", () => {
  it("refuse si validateInteraction retourne un message d'erreur", async () => {
    const { ctrl, worldService } = makeController();
    worldService.validateInteraction.mockReturnValue("Trop loin (distance=9000 WU, rayon=2048 WU).");
    await expect(
      ctrl.buyListing(REQ as any, "lst-1", { buildingId: "bld-1" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepte si validateInteraction retourne null", async () => {
    const { ctrl, worldService, auctionService } = makeController();
    worldService.validateInteraction.mockReturnValue(null);
    await ctrl.buyListing(REQ as any, "lst-1", { buildingId: "bld-1" });
    expect(auctionService.buyListing).toHaveBeenCalledWith({
      buyerCharacterId: CHARACTER.id,
      listingId: "lst-1",
    });
  });
});

// ── lecture publique — buildingId facultatif ──────────────────────────────────

describe("AuctionController — lecture publique", () => {
  it("getActiveListings : appelle auctionService sans validation si buildingId absent", async () => {
    const { ctrl, auctionService, buildingsService } = makeController();
    await ctrl.getActiveListings(REQ as any, undefined);
    expect(auctionService.getActiveListings).toHaveBeenCalled();
    expect(buildingsService.findBuildingById).not.toHaveBeenCalled();
  });
});
