import { NotFoundException } from "@nestjs/common";
import { EconomyController } from "./economy.controller";

const CHARACTER = { id: "char-1" };
const WALLET = { id: "wallet-1", balanceBronze: "12345" };

function makeController(overrides: { character?: any; wallet?: any } = {}) {
  const character = overrides.character !== undefined ? overrides.character : CHARACTER;
  const wallet    = overrides.wallet    !== undefined ? overrides.wallet    : WALLET;

  const characterService = {
    findFirstByUser: character === null
      ? jest.fn().mockRejectedValue(new NotFoundException("no char"))
      : jest.fn().mockResolvedValue(character),
  };
  const economyService = {
    getOrCreateWallet: jest.fn().mockResolvedValue(wallet),
  };

  const ctrl = new EconomyController(economyService as any, characterService as any);
  return { ctrl, characterService, economyService };
}

const REQ = { user: { userId: "user-1" } };

describe("EconomyController — GET /economy/me/balance", () => {
  it("retourne le solde décomposé en gold/silver/bronze", async () => {
    const { ctrl } = makeController({ wallet: { id: "w1", balanceBronze: "12345" } });
    const result = await ctrl.getMyBalance(REQ as any);
    expect(result).toEqual({
      balanceBronze: "12345",
      gold: 1,
      silver: 23,
      bronze: 45,
    });
  });

  it("retourne zéro pour un wallet vide", async () => {
    const { ctrl } = makeController({ wallet: { id: "w1", balanceBronze: "0" } });
    const result = await ctrl.getMyBalance(REQ as any);
    expect(result).toEqual({ balanceBronze: "0", gold: 0, silver: 0, bronze: 0 });
  });

  it("propage NotFoundException si aucun personnage", async () => {
    const { ctrl } = makeController({ character: null });
    await expect(ctrl.getMyBalance(REQ as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("appelle getOrCreateWallet avec ownerType=character et l'id du personnage", async () => {
    const { ctrl, economyService } = makeController();
    await ctrl.getMyBalance(REQ as any);
    expect(economyService.getOrCreateWallet).toHaveBeenCalledWith("character", CHARACTER.id);
  });
});
