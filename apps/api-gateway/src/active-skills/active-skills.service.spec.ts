import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ActiveSkillsService } from "./active-skills.service";
import { SkillDefinition } from "./entities/skill-definition.entity";

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "id-1",
    key: "power_strike",
    name: "Power Strike",
    description: "",
    iconAssetPath: null,
    enabled: true,
    requiredLevel: 1,
    requiredClass: null,
    requiredMasteries: {},
    resourceType: null,
    resourceCost: 0,
    cooldownMs: 1000,
    castTimeMs: 0,
    rangeWU: 1,
    radiusWU: 0,
    targetMode: "creature",
    effectType: "damage",
    scaling: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((d) => makeSkill(d)),
    save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
    merge: jest.fn().mockImplementation((existing, patch) => ({ ...existing, ...patch })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

describe("ActiveSkillsService", () => {
  let service: ActiveSkillsService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveSkillsService,
        { provide: getRepositoryToken(SkillDefinition), useValue: repo },
      ],
    }).compile();
    service = module.get<ActiveSkillsService>(ActiveSkillsService);
  });

  describe("listDefinitions — cache", () => {
    it("charge depuis le repo au premier appel puis sert le cache", async () => {
      repo.find.mockResolvedValue([makeSkill()]);
      await service.listDefinitions();
      await service.listDefinitions();
      expect(repo.find).toHaveBeenCalledTimes(1);
    });

    it("recharge apres invalidation du cache", async () => {
      repo.find.mockResolvedValue([makeSkill()]);
      await service.listDefinitions();
      service.invalidateCache();
      await service.listDefinitions();
      expect(repo.find).toHaveBeenCalledTimes(2);
    });

    it("retourne une copie, pas la reference interne du cache", async () => {
      repo.find.mockResolvedValue([makeSkill()]);
      const first = await service.listDefinitions();
      first.push(makeSkill({ key: "mutated" }));
      const second = await service.listDefinitions();
      expect(second).toHaveLength(1);
    });
  });

  describe("getDefinition", () => {
    it("retourne la definition existante", async () => {
      repo.find.mockResolvedValue([makeSkill({ key: "fireball" })]);
      const found = await service.getDefinition("fireball");
      expect(found.key).toBe("fireball");
    });

    it("leve NotFound si absente", async () => {
      repo.find.mockResolvedValue([]);
      await expect(service.getDefinition("nope")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("createDefinition", () => {
    it("cree une definition et invalide le cache", async () => {
      repo.find.mockResolvedValue([]);
      await service.listDefinitions(); // amorce le cache
      repo.findOne.mockResolvedValue(null);
      await service.createDefinition({ key: "power_strike", name: "Power Strike" });
      expect(repo.save).toHaveBeenCalledTimes(1);
      // cache invalide → nouveau find
      repo.find.mockResolvedValue([makeSkill()]);
      await service.listDefinitions();
      expect(repo.find).toHaveBeenCalledTimes(2);
    });

    it("leve Conflict si la key existe deja", async () => {
      repo.findOne.mockResolvedValue(makeSkill());
      await expect(
        service.createDefinition({ key: "power_strike", name: "X" }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("rejette requiredMasteries avec une valeur negative", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "k",
          name: "N",
          requiredMasteries: { two_handed: -1 },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejette un groupe de scaling inconnu", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "k",
          name: "N",
          scaling: { unknownGroup: { strength: 1 } },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejette un coefficient de scaling non numerique", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "k",
          name: "N",
          scaling: { primaryCoefficients: { strength: "high" } } as never,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("accepte un scaling valide", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "k",
          name: "N",
          scaling: {
            primaryCoefficients: { strength: 1.2 },
            masteryCoefficients: { two_handed: 0.1 },
          },
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("updateDefinition", () => {
    it("merge et sauve une definition existante", async () => {
      repo.findOne.mockResolvedValue(makeSkill());
      const updated = await service.updateDefinition("power_strike", { name: "Renamed" });
      expect(updated.name).toBe("Renamed");
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it("leve NotFound si la key n'existe pas", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.updateDefinition("nope", { name: "X" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("disableDefinition", () => {
    it("passe enabled a false", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ enabled: true }));
      const disabled = await service.disableDefinition("power_strike");
      expect(disabled.enabled).toBe(false);
    });
  });

  describe("deleteDefinition", () => {
    it("supprime et invalide le cache", async () => {
      repo.delete.mockResolvedValue({ affected: 1 });
      const res = await service.deleteDefinition("power_strike");
      expect(res).toEqual({ key: "power_strike", deleted: true });
    });

    it("leve NotFound si rien supprime", async () => {
      repo.delete.mockResolvedValue({ affected: 0 });
      await expect(service.deleteDefinition("nope")).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
