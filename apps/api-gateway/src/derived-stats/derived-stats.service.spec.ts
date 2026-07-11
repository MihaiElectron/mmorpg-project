import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DerivedStatsService } from "./derived-stats.service";
import { DerivedStatDefinition } from "./entities/derived-stat-definition.entity";
import { DEFAULT_DERIVED_STAT_DEFINITIONS } from "./derived-stats.constants";

function makeRepo() {
  return {
    count: jest.fn().mockResolvedValue(24),
    find: jest.fn().mockResolvedValue(DEFAULT_DERIVED_STAT_DEFINITIONS),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((d) => d),
    save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
    merge: jest.fn().mockImplementation((existing, patch) => ({ ...existing, ...patch })),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

describe("DerivedStatsService", () => {
  let service: DerivedStatsService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DerivedStatsService,
        { provide: getRepositoryToken(DerivedStatDefinition), useValue: repo },
      ],
    }).compile();
    service = module.get<DerivedStatsService>(DerivedStatsService);
  });

  describe("onModuleInit — seed", () => {
    it("seed les 24 defaults si la table est vide", async () => {
      repo.count.mockResolvedValue(0);
      await service.onModuleInit();
      expect(repo.save).toHaveBeenCalledTimes(1);
      const saved = repo.save.mock.calls[0][0];
      expect(saved).toHaveLength(DEFAULT_DERIVED_STAT_DEFINITIONS.length);
    });

    it("ne re-seed pas si la table contient déjà des lignes", async () => {
      repo.count.mockResolvedValue(24);
      await service.onModuleInit();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("réconciliation V3-B — targets mastery (non destructif)", () => {
    it("promeut une dérivée implémentée encore à l'état par défaut V3-A", async () => {
      repo.count.mockResolvedValue(24);
      repo.find.mockResolvedValue([
        { key: "physicalAttack", masteryEligible: false, runtimeStatus: "calculatedOnly", allowedModifierModes: [] },
      ]);
      await service.onModuleInit();
      expect(repo.save).toHaveBeenCalledWith([
        expect.objectContaining({
          key: "physicalAttack",
          masteryEligible: true,
          runtimeStatus: "implemented",
          allowedModifierModes: ["percentPerLevel", "flatPerLevel"],
        }),
      ]);
    });

    it("n'écrase JAMAIS une dérivée déjà éditée (masteryEligible/runtimeStatus différents)", async () => {
      repo.count.mockResolvedValue(24);
      repo.find.mockResolvedValue([
        { key: "physicalAttack", masteryEligible: true, runtimeStatus: "implemented", allowedModifierModes: ["percentPerLevel"] },
        { key: "maxHealth", masteryEligible: false, runtimeStatus: "notHooked", allowedModifierModes: [] },
      ]);
      await service.onModuleInit();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("ignore une clé hors des 10 implémentées (garde défensif)", async () => {
      repo.count.mockResolvedValue(24);
      repo.find.mockResolvedValue([
        { key: "criticalChance", masteryEligible: false, runtimeStatus: "calculatedOnly", allowedModifierModes: [] },
      ]);
      await service.onModuleInit();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("suppression / système (V3 maintenance)", () => {
    it("isSystemStat true pour une clé seedée, false pour une custom", () => {
      expect(service.isSystemStat("maxHealth")).toBe(true);
      expect(service.isSystemStat("luck")).toBe(false);
    });

    it("supprime une stat CUSTOM existante", async () => {
      repo.findOne.mockResolvedValue({ key: "luck" });
      await service.deleteDefinition("luck");
      expect(repo.remove).toHaveBeenCalledWith({ key: "luck" });
    });

    it("refuse la suppression d'une stat SYSTÈME", async () => {
      repo.findOne.mockResolvedValue({ key: "maxHealth" });
      await expect(service.deleteDefinition("maxHealth")).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it("refuse la suppression d'une clé inconnue (404)", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.deleteDefinition("ghost")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("getStatCatalogForPlayer (V3-B)", () => {
    it("retourne les 10 primaires + les dérivées enabled avec labels serveur", async () => {
      repo.find.mockResolvedValue([
        { key: "maxHealth", label: "PV max", category: "resources", displayOrder: 1, enabled: true, runtimeStatus: "implemented", description: null },
        { key: "hidden", label: "Cachée", category: "offensive", displayOrder: 2, enabled: false, runtimeStatus: "notHooked", description: null },
      ]);
      const catalog = await service.getStatCatalogForPlayer();
      expect(catalog.primaryStats).toHaveLength(10);
      expect(catalog.primaryStats[0]).toEqual({ key: "strength", label: "Force" });
      expect(catalog.derivedStats.map((d) => d.key)).toEqual(["maxHealth"]);
      expect(catalog.derivedStats[0]).toMatchObject({ label: "PV max", runtimeStatus: "implemented" });
    });
  });

  describe("getDefinitions — cache", () => {
    it("charge depuis le repo puis sert depuis le cache", async () => {
      const first = await service.getDefinitions();
      const second = await service.getDefinitions();
      expect(repo.find).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
    });

    it("retombe sur les defaults V1 si le repo renvoie une liste vide", async () => {
      repo.find.mockResolvedValue([]);
      const defs = await service.getDefinitions();
      expect(defs).toEqual(DEFAULT_DERIVED_STAT_DEFINITIONS);
    });
  });

  describe("updateDefinition", () => {
    it("refuse une clé inconnue (pas de création)", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.updateDefinition("unknownStat", { baseValue: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuse un coefficient sur une stat primaire inconnue", async () => {
      repo.findOne.mockResolvedValue({ ...DEFAULT_DERIVED_STAT_DEFINITIONS[0] });
      await expect(
        service.updateDefinition("maxHealth", {
          primaryCoefficients: { notAPrimary: 1 },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse un coefficient non numérique", async () => {
      repo.findOne.mockResolvedValue({ ...DEFAULT_DERIVED_STAT_DEFINITIONS[0] });
      await expect(
        service.updateDefinition("maxHealth", {
          primaryCoefficients: { vitality: "dix" as unknown as number },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse minValue > maxValue", async () => {
      repo.findOne.mockResolvedValue({ ...DEFAULT_DERIVED_STAT_DEFINITIONS[0] });
      await expect(
        service.updateDefinition("maxHealth", { minValue: 10, maxValue: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse une catégorie invalide", async () => {
      repo.findOne.mockResolvedValue({ ...DEFAULT_DERIVED_STAT_DEFINITIONS[0] });
      await expect(
        service.updateDefinition("maxHealth", { category: "invalid" as any }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    describe("garde-fou dérivées système critiques (maxHealth/physicalAttack/defense)", () => {
      it.each(["maxHealth", "physicalAttack", "defense"])(
        "refuse enabled=false sur %s",
        async (key) => {
          repo.findOne.mockResolvedValue({
            ...DEFAULT_DERIVED_STAT_DEFINITIONS.find((d) => d.key === key)!,
          });
          await expect(
            service.updateDefinition(key, { enabled: false }),
          ).rejects.toBeInstanceOf(BadRequestException);
          expect(repo.save).not.toHaveBeenCalled();
        },
      );

      it.each(["maxHealth", "physicalAttack", "defense"])(
        "accepte enabled=true sur %s (no-op explicite autorisé)",
        async (key) => {
          const existing = { ...DEFAULT_DERIVED_STAT_DEFINITIONS.find((d) => d.key === key)! };
          repo.findOne.mockResolvedValue(existing);
          await expect(
            service.updateDefinition(key, { enabled: true }),
          ).resolves.toBeDefined();
        },
      );

      it.each(["maxHealth", "physicalAttack", "defense"])(
        "autorise la modification des coefficients/baseValue/min/max sur %s",
        async (key) => {
          const existing = { ...DEFAULT_DERIVED_STAT_DEFINITIONS.find((d) => d.key === key)! };
          repo.findOne.mockResolvedValue(existing);
          const updated = await service.updateDefinition(key, {
            baseValue: 5,
            primaryCoefficients: { vitality: 20 },
            minValue: 0,
            maxValue: 999,
          });
          expect(updated).toBeDefined();
          expect(repo.save).toHaveBeenCalled();
        },
      );

      it("n'affecte pas une dérivée non critique (criticalChance reste désactivable)", async () => {
        const existing = { ...DEFAULT_DERIVED_STAT_DEFINITIONS.find((d) => d.key === "criticalChance")! };
        repo.findOne.mockResolvedValue(existing);
        await expect(
          service.updateDefinition("criticalChance", { enabled: false }),
        ).resolves.toBeDefined();
      });
    });

    it("applique un patch valide et invalide le cache", async () => {
      const existing = { ...DEFAULT_DERIVED_STAT_DEFINITIONS.find((d) => d.key === "criticalChance")! };
      repo.findOne.mockResolvedValue(existing);

      // Charge une première fois pour peupler le cache.
      await service.getDefinitions();
      expect(repo.find).toHaveBeenCalledTimes(1);

      await service.updateDefinition("criticalChance", {
        primaryCoefficients: { dexterity: 0.5 },
      });

      await service.getDefinitions();
      expect(repo.find).toHaveBeenCalledTimes(2); // cache invalidé → re-fetch
    });
  });

  describe("createDefinition (Studio Stats secondaires — V3-A)", () => {
    const validDto = {
      key: "luck",
      label: "Chance",
      category: "social_threat" as const,
      baseValue: 1,
      primaryCoefficients: { charisma: 0.5 },
    };

    it("crée une dérivée custom et invalide le cache", async () => {
      repo.findOne.mockResolvedValue(null);
      await service.getDefinitions(); // amorce le cache
      const created = await service.createDefinition({ ...validDto });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(created).toMatchObject({ key: "luck", label: "Chance", rawStatSource: null });
      // cache invalidé → nouveau find
      await service.getDefinitions();
      expect(repo.find).toHaveBeenCalledTimes(2);
    });

    it("refuse une key déjà existante (key immuable)", async () => {
      repo.findOne.mockResolvedValue(DEFAULT_DERIVED_STAT_DEFINITIONS[0]);
      await expect(service.createDefinition({ ...validDto, key: "maxHealth" }))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("valide les coefficients (stat primaire inconnue, valeur non numérique)", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({ ...validDto, primaryCoefficients: { luck: 1 } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.createDefinition({
          ...validDto,
          primaryCoefficients: { charisma: NaN },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse min > max et NaN/Infinity sur les bornes", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({ ...validDto, minValue: 10, maxValue: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.createDefinition({ ...validDto, baseValue: Infinity }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("getDefinition retourne la dérivée ou NotFound", async () => {
      repo.findOne.mockResolvedValue(DEFAULT_DERIVED_STAT_DEFINITIONS[0]);
      await expect(service.getDefinition("maxHealth")).resolves.toBeDefined();
      repo.findOne.mockResolvedValue(null);
      await expect(service.getDefinition("ghost")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("previewDerivedStats", () => {
    it("calcule avec la config persistée si aucun brouillon fourni", async () => {
      const result = await service.previewDerivedStats({
        primaryStats: { vitality: 5 },
      });
      // maxHealth = rawStatSource(maxHealth, absent ici → 0) + vitality*10
      expect(result.maxHealth).toBe(50);
    });

    it("utilise rawStats pour les dérivées à rawStatSource", async () => {
      const result = await service.previewDerivedStats({
        primaryStats: { vitality: 5 },
        rawStats: { maxHealth: 100, attack: 0, defense: 0 },
      });
      expect(result.maxHealth).toBe(150);
    });

    it("applique un draftDefinitions pour prévisualiser un changement non sauvegardé", async () => {
      const withoutDraft = await service.previewDerivedStats({
        primaryStats: { dexterity: 10, agility: 0 },
      });
      const withDraft = await service.previewDerivedStats({
        primaryStats: { dexterity: 10, agility: 0 },
        draftDefinitions: [{ key: "criticalChance", primaryCoefficients: { dexterity: 1 } }],
      });
      expect(withDraft.criticalChance).not.toBe(withoutDraft.criticalChance);
      expect(withDraft.criticalChance).toBe(10);
    });

    it("refuse une clé inconnue dans draftDefinitions", async () => {
      await expect(
        service.previewDerivedStats({
          draftDefinitions: [{ key: "notReal", baseValue: 1 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
