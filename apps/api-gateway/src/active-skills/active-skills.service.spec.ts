import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ActiveSkillsService } from "./active-skills.service";
import { SkillDefinition } from "./entities/skill-definition.entity";
import { PlayerSkillUnlock } from "./entities/player-skill-unlock.entity";

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "id-1",
    key: "power_strike",
    name: "Power Strike",
    description: "",
    iconAssetPath: null,
    enabled: true,
    skillKind: "active",
    autoUnlock: true,
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

function makeUnlockRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((d) => d),
    save: jest.fn().mockImplementation((d) => Promise.resolve({ id: "unlock-1", ...d })),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
}

describe("ActiveSkillsService", () => {
  let service: ActiveSkillsService;
  let repo: ReturnType<typeof makeRepo>;
  let unlockRepo: ReturnType<typeof makeUnlockRepo>;

  beforeEach(async () => {
    repo = makeRepo();
    unlockRepo = makeUnlockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActiveSkillsService,
        { provide: getRepositoryToken(SkillDefinition), useValue: repo },
        { provide: getRepositoryToken(PlayerSkillUnlock), useValue: unlockRepo },
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

  describe("getUsableSkillsForCharacter", () => {
    it("exclut les skills disabled", async () => {
      repo.find.mockResolvedValue([makeSkill({ key: "off", enabled: false })]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res).toHaveLength(0);
    });

    it("exclut si requiredLevel non atteint", async () => {
      repo.find.mockResolvedValue([makeSkill({ key: "hi", requiredLevel: 20 })]);
      const res = await service.getUsableSkillsForCharacter("char-1", 5, {});
      expect(res).toHaveLength(0);
    });

    it("exclut si une requiredMastery est insuffisante", async () => {
      repo.find.mockResolvedValue([
        makeSkill({ key: "m", requiredMasteries: { two_handed: 5 } }),
      ]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, { two_handed: 2 });
      expect(res).toHaveLength(0);
    });

    it("renvoie executable=true pour un skill damage/creature sans coût bloquant", async () => {
      repo.find.mockResolvedValue([makeSkill({ key: "ok" })]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ key: "ok", executable: true });
      expect(res[0].disabledReason).toBeUndefined();
      // pas de données sensibles exposées
      expect(res[0]).not.toHaveProperty("scaling");
      expect(res[0]).not.toHaveProperty("id");
    });

    it("marque non exécutable un coût mana > 0 (ressource non implémentée)", async () => {
      repo.find.mockResolvedValue([
        makeSkill({ key: "mana", resourceType: "mana", resourceCost: 10 }),
      ]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res).toHaveLength(1);
      expect(res[0].executable).toBe(false);
      expect(res[0].disabledReason).toMatch(/mana/i);
    });

    it("marque non exécutable un effet non damage", async () => {
      repo.find.mockResolvedValue([makeSkill({ key: "heal", effectType: "heal" })]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res[0].executable).toBe(false);
      expect(res[0].disabledReason).toMatch(/effet/i);
    });

    it("renvoie executable=true pour un skill heal/self sans coût bloquant (test_heal)", async () => {
      repo.find.mockResolvedValue([
        makeSkill({
          key: "test_heal",
          targetMode: "self",
          effectType: "heal",
          resourceType: null,
          resourceCost: 0,
          scaling: { derivedCoefficients: { healingPower: 3 } },
        }),
      ]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ key: "test_heal", executable: true });
      expect(res[0].disabledReason).toBeUndefined();
    });

    it("marque non exécutable un heal/self avec coût mana > 0", async () => {
      repo.find.mockResolvedValue([
        makeSkill({ key: "h", targetMode: "self", effectType: "heal", resourceType: "mana", resourceCost: 5 }),
      ]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res[0].executable).toBe(false);
      expect(res[0].disabledReason).toMatch(/mana/i);
    });

    // ── Déverrouillage (V1-H) ────────────────────────────────────────────────
    it("autoUnlock=true → présent sans player_skill_unlock", async () => {
      repo.find.mockResolvedValue([makeSkill({ id: "s1", key: "auto", autoUnlock: true })]);
      unlockRepo.find.mockResolvedValue([]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res.map((r) => r.key)).toContain("auto");
    });

    it("autoUnlock=false sans unlock → absent", async () => {
      repo.find.mockResolvedValue([makeSkill({ id: "s1", key: "locked", autoUnlock: false })]);
      unlockRepo.find.mockResolvedValue([]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res).toHaveLength(0);
    });

    it("autoUnlock=false avec unlock → présent", async () => {
      repo.find.mockResolvedValue([makeSkill({ id: "s1", key: "learned", autoUnlock: false })]);
      unlockRepo.find.mockResolvedValue([{ skillDefinitionId: "s1" }]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res.map((r) => r.key)).toContain("learned");
    });

    it("skillKind=passive → absent même si débloqué", async () => {
      repo.find.mockResolvedValue([makeSkill({ id: "s1", key: "pas", skillKind: "passive" })]);
      unlockRepo.find.mockResolvedValue([{ skillDefinitionId: "s1" }]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res).toHaveLength(0);
    });

    it("skillKind=aura → absent même si débloqué", async () => {
      repo.find.mockResolvedValue([makeSkill({ id: "s1", key: "aura", skillKind: "aura" })]);
      unlockRepo.find.mockResolvedValue([{ skillDefinitionId: "s1" }]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res).toHaveLength(0);
    });
  });

  describe("unlock/lock par personnage", () => {
    it("isSkillUnlocked reflète le count", async () => {
      unlockRepo.count.mockResolvedValueOnce(1);
      expect(await service.isSkillUnlocked("char-1", "s1")).toBe(true);
      unlockRepo.count.mockResolvedValueOnce(0);
      expect(await service.isSkillUnlocked("char-1", "s2")).toBe(false);
    });

    it("getUnlockedSkillDefinitionIds renvoie un Set d'ids", async () => {
      unlockRepo.find.mockResolvedValue([{ skillDefinitionId: "a" }, { skillDefinitionId: "b" }]);
      const set = await service.getUnlockedSkillDefinitionIds("char-1");
      expect(set.has("a")).toBe(true);
      expect(set.has("b")).toBe(true);
      expect(set.size).toBe(2);
    });

    it("unlock crée une ligne (skillKey résolu → id, jamais stocké)", async () => {
      repo.find.mockResolvedValue([makeSkill({ id: "s1", key: "fireball" })]);
      unlockRepo.findOne.mockResolvedValue(null);
      await service.unlockSkillForCharacter("char-1", "fireball", "admin");
      expect(unlockRepo.save).toHaveBeenCalledTimes(1);
      const created = unlockRepo.create.mock.calls[0][0];
      expect(created).toEqual({ characterId: "char-1", skillDefinitionId: "s1", source: "admin" });
      expect(created).not.toHaveProperty("skillKey");
    });

    it("unlock idempotent : ne crée pas de doublon si déjà débloqué", async () => {
      repo.find.mockResolvedValue([makeSkill({ id: "s1", key: "fireball" })]);
      unlockRepo.findOne.mockResolvedValue({ id: "u1", characterId: "char-1", skillDefinitionId: "s1" });
      await service.unlockSkillForCharacter("char-1", "fireball");
      expect(unlockRepo.save).not.toHaveBeenCalled();
    });

    it("unlock rejette une source inconnue", async () => {
      repo.find.mockResolvedValue([makeSkill({ id: "s1", key: "fireball" })]);
      unlockRepo.findOne.mockResolvedValue(null);
      await expect(
        service.unlockSkillForCharacter("char-1", "fireball", "hacker" as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("unlock lève NotFound si la clé est inconnue", async () => {
      repo.find.mockResolvedValue([]);
      await expect(service.unlockSkillForCharacter("char-1", "nope")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lock supprime l'unlock", async () => {
      repo.find.mockResolvedValue([makeSkill({ id: "s1", key: "fireball" })]);
      unlockRepo.delete.mockResolvedValue({ affected: 1 });
      const res = await service.lockSkillForCharacter("char-1", "fireball");
      expect(unlockRepo.delete).toHaveBeenCalledWith({ characterId: "char-1", skillDefinitionId: "s1" });
      expect(res).toEqual({ skillKey: "fireball", locked: true });
    });

    it("lock idempotent si aucune ligne", async () => {
      repo.find.mockResolvedValue([makeSkill({ id: "s1", key: "fireball" })]);
      unlockRepo.delete.mockResolvedValue({ affected: 0 });
      const res = await service.lockSkillForCharacter("char-1", "fireball");
      expect(res).toEqual({ skillKey: "fireball", locked: false });
    });
  });
});
