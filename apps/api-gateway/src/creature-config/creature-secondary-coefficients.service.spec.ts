import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { CreatureSecondaryCoefficientsService } from "./creature-secondary-coefficients.service";
import { CreatureSecondaryCoefficientConfig } from "./entities/creature-secondary-coefficient-config.entity";
import { DEFAULT_CREATURE_SECONDARY_COEFFICIENTS } from "../creature-runtime/creature-runtime.calculator";

/** Ligne DB complète = defaults + id. */
function dbRow(overrides: Partial<CreatureSecondaryCoefficientConfig> = {}): CreatureSecondaryCoefficientConfig {
  return { id: 1, ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS, ...overrides } as CreatureSecondaryCoefficientConfig;
}

describe("CreatureSecondaryCoefficientsService", () => {
  let service: CreatureSecondaryCoefficientsService;
  let repo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };

  async function build(): Promise<CreatureSecondaryCoefficientsService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatureSecondaryCoefficientsService,
        { provide: getRepositoryToken(CreatureSecondaryCoefficientConfig), useValue: repo },
      ],
    }).compile();
    return module.get(CreatureSecondaryCoefficientsService);
  }

  beforeEach(() => {
    repo = {
      findOne: jest.fn().mockResolvedValue(dbRow()),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
      create: jest.fn().mockImplementation((c) => c),
    };
  });

  it("getCoefficients retourne les defaults avant tout chargement (fallback code)", async () => {
    service = await build();
    // Pas encore de onModuleInit : le cache est initialisé aux defaults.
    expect(service.getCoefficients()).toEqual(DEFAULT_CREATURE_SECONDARY_COEFFICIENTS);
  });

  it("config absente au démarrage → seed des defaults + cache defaults", async () => {
    repo.findOne.mockResolvedValueOnce(null);
    service = await build();
    await service.onModuleInit();
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save.mock.calls[0][0]).toMatchObject({ id: 1, ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS });
    expect(service.getCoefficients()).toEqual(DEFAULT_CREATURE_SECONDARY_COEFFICIENTS);
  });

  it("config DB présente → charge la config (sanitizée) dans le cache", async () => {
    repo.findOne.mockResolvedValue(dbRow({ attackPowerPerStrength: 7, secondaryChanceCap: 55 }));
    service = await build();
    await service.onModuleInit();
    const c = service.getCoefficients();
    expect(c.attackPowerPerStrength).toBe(7);
    expect(c.secondaryChanceCap).toBe(55);
    // Les autres clés restent aux defaults.
    expect(c.defenseTotalPerEndurance).toBe(DEFAULT_CREATURE_SECONDARY_COEFFICIENTS.defenseTotalPerEndurance);
  });

  it("ligne DB partielle/invalide → merge/sanitize vers les defaults (pas de NaN/Infinity/null)", async () => {
    repo.findOne.mockResolvedValue({
      id: 1,
      attackPowerPerStrength: 9, // valide → conservé
      defenseTotalPerEndurance: null, // invalide → default
      accuracyPerDexterity: NaN, // invalide → default
      dodgePerAgility: Infinity, // invalide → default
      blockPerEndurance: "5" as unknown as number, // mauvais type → default
      // clés restantes absentes → defaults
    } as Partial<CreatureSecondaryCoefficientConfig>);
    service = await build();
    await service.onModuleInit();
    const c = service.getCoefficients();
    expect(c.attackPowerPerStrength).toBe(9);
    expect(c.defenseTotalPerEndurance).toBe(DEFAULT_CREATURE_SECONDARY_COEFFICIENTS.defenseTotalPerEndurance);
    expect(c.accuracyPerDexterity).toBe(DEFAULT_CREATURE_SECONDARY_COEFFICIENTS.accuracyPerDexterity);
    expect(c.dodgePerAgility).toBe(DEFAULT_CREATURE_SECONDARY_COEFFICIENTS.dodgePerAgility);
    expect(c.blockPerEndurance).toBe(DEFAULT_CREATURE_SECONDARY_COEFFICIENTS.blockPerEndurance);
    // Toutes les valeurs finales sont finies.
    for (const v of Object.values(c)) expect(Number.isFinite(v)).toBe(true);
  });

  it("erreur DB au démarrage → garde les defaults sans casser (pas de throw)", async () => {
    repo.findOne.mockRejectedValue(new Error("db down"));
    service = await build();
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(service.getCoefficients()).toEqual(DEFAULT_CREATURE_SECONDARY_COEFFICIENTS);
  });

  it("cache mémoire : getCoefficients ne relit pas la DB après chargement", async () => {
    service = await build();
    await service.onModuleInit();
    repo.findOne.mockClear();
    service.getCoefficients();
    service.getCoefficients();
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it("getCoefficients retourne une copie défensive (mutation externe sans effet sur le cache)", async () => {
    service = await build();
    await service.onModuleInit();
    const c = service.getCoefficients();
    c.attackPowerPerStrength = 999;
    expect(service.getCoefficients().attackPowerPerStrength).toBe(
      DEFAULT_CREATURE_SECONDARY_COEFFICIENTS.attackPowerPerStrength,
    );
  });

  it("reloadCache recharge la DB dans le cache", async () => {
    service = await build();
    await service.onModuleInit();
    repo.findOne.mockResolvedValue(dbRow({ maxHealthPerVitality: 42 }));
    const reloaded = await service.reloadCache();
    expect(reloaded.maxHealthPerVitality).toBe(42);
    expect(service.getCoefficients().maxHealthPerVitality).toBe(42);
  });

  it("updateCoefficients applique un patch valide, ignore le non-fini, et rafraîchit le cache", async () => {
    service = await build();
    await service.onModuleInit();
    // La ligne persistée reflète le save (le repo renvoie ce qu'on lui donne).
    repo.findOne.mockImplementation(() => Promise.resolve(dbRow()));
    repo.save.mockImplementation((row) => {
      repo.findOne.mockResolvedValue(row);
      return Promise.resolve(row);
    });
    const updated = await service.updateCoefficients({
      attackPowerPerStrength: 4,
      defenseTotalPerEndurance: NaN, // ignoré
      secondaryChanceCap: 30,
    });
    expect(updated.attackPowerPerStrength).toBe(4);
    expect(updated.secondaryChanceCap).toBe(30);
    expect(updated.defenseTotalPerEndurance).toBe(DEFAULT_CREATURE_SECONDARY_COEFFICIENTS.defenseTotalPerEndurance);
    expect(service.getCoefficients().attackPowerPerStrength).toBe(4);
  });
});
