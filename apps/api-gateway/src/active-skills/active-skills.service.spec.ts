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
    weaponType: null,
    resourceType: null,
    resourceCost: 0,
    cooldownMs: 1000,
    castTimeMs: 0,
    rangeWU: 1,
    radiusWU: 0,
    targetMode: "creature",
    effectType: "damage",
    damageType: "physical",
    attackDefenseKind: "physical",
    magicSchool: null,
    canBeDodged: true,
    canBeBlocked: true,
    canBeParried: false,
    canCrit: false,
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
    // Mime TypeORM.create : les champs OMIS du DTO restent undefined dans l'entité
    // (les DEFAULT colonne ne s'appliquent qu'à l'INSERT). canCrit non fourni →
    // undefined (pas le défaut false du fixture) pour tester le défaut serveur.
    create: jest.fn().mockImplementation((d) => ({ ...makeSkill(d), canCrit: d.canCrit })),
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

    // ── weaponType (V1-D-Skills-A) ──────────────────────────────────────────
    it("create sans weaponType → champ non touché (défaut colonne null)", async () => {
      repo.findOne.mockResolvedValue(null);
      await service.createDefinition({ key: "k", name: "N" });
      const created = repo.create.mock.calls[0][0] as Record<string, unknown>;
      expect(created).not.toHaveProperty("weaponType");
    });

    it("create avec weaponType valide → persisté trimé", async () => {
      repo.findOne.mockResolvedValue(null);
      await service.createDefinition({
        key: "cleave",
        name: "Cleave",
        weaponType: " two_handed_sword ",
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ weaponType: "two_handed_sword" }),
      );
    });

    it("create avec weaponType vide → null (skill non lié à une arme)", async () => {
      repo.findOne.mockResolvedValue(null);
      await service.createDefinition({ key: "fireball", name: "Fireball", weaponType: "" });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ weaponType: null }),
      );
    });

    it("create avec weaponType invalide → BadRequest, rien de sauvegardé", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({ key: "k", name: "N", weaponType: "Two-Handed!" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    // ── attackDefenseKind (V6-B5) ───────────────────────────────────────────
    it("create sans attackDefenseKind → défaut physical (colonne)", async () => {
      repo.findOne.mockResolvedValue(null);
      const saved = await service.createDefinition({ key: "k", name: "N" });
      // Non fourni → non transmis à repo.create ; le défaut de colonne 'physical'
      // s'applique à l'insert (fixture makeSkill reflète ce défaut).
      const created = repo.create.mock.calls[0][0] as Record<string, unknown>;
      expect(created).not.toHaveProperty("attackDefenseKind");
      expect(saved.attackDefenseKind).toBe("physical");
    });

    it("create avec attackDefenseKind magic → persiste magic", async () => {
      repo.findOne.mockResolvedValue(null);
      const saved = await service.createDefinition({
        key: "fireball",
        name: "Fireball",
        attackDefenseKind: "magic",
        magicSchool: "fire", // un skill magic exige une école (cohérence serveur)
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ attackDefenseKind: "magic" }),
      );
      expect(saved.attackDefenseKind).toBe("magic");
    });

    it("create avec attackDefenseKind explicite physical → persiste physical (damageType intact)", async () => {
      repo.findOne.mockResolvedValue(null);
      const saved = await service.createDefinition({
        key: "smash",
        name: "Smash",
        attackDefenseKind: "physical",
        damageType: "raw",
      });
      expect(saved.attackDefenseKind).toBe("physical");
      // Axe distinct : damageType reste ce qui est fourni (raw).
      expect(saved.damageType).toBe("raw");
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

    // ── weaponType (V1-D-Skills-A) ──────────────────────────────────────────
    it("update weaponType valide → persisté", async () => {
      repo.findOne.mockResolvedValue(makeSkill());
      const updated = await service.updateDefinition("power_strike", {
        weaponType: "two_handed_sword",
      });
      expect(updated.weaponType).toBe("two_handed_sword");
    });

    it("update weaponType null ou vide → null", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ weaponType: "two_handed_sword" }));
      const cleared = await service.updateDefinition("power_strike", { weaponType: null });
      expect(cleared.weaponType).toBeNull();

      repo.findOne.mockResolvedValue(makeSkill({ weaponType: "two_handed_sword" }));
      const emptied = await service.updateDefinition("power_strike", { weaponType: "  " });
      expect(emptied.weaponType).toBeNull();
    });

    it("update sans weaponType conserve la valeur existante", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ weaponType: "bow" }));
      const updated = await service.updateDefinition("power_strike", { name: "Renamed" });
      expect(updated.weaponType).toBe("bow");
    });

    it("update weaponType invalide → BadRequest", async () => {
      repo.findOne.mockResolvedValue(makeSkill());
      await expect(
        service.updateDefinition("power_strike", { weaponType: "épée" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe("damageType (V4-B)", () => {
    it("création sans damageType → physical par défaut", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({ key: "k", name: "N" });
      expect(created.damageType).toBe("physical");
    });

    it("création avec damageType raw persiste raw", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "k",
        name: "N",
        damageType: "raw",
      });
      expect(created.damageType).toBe("raw");
    });

    it("update peut basculer un skill en raw", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ damageType: "physical" }));
      const updated = await service.updateDefinition("power_strike", { damageType: "raw" });
      expect(updated.damageType).toBe("raw");
    });
  });

  describe("attackDefenseKind (V6-B5)", () => {
    it("création sans attackDefenseKind → physical par défaut", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({ key: "k", name: "N" });
      expect(created.attackDefenseKind).toBe("physical");
    });

    it("création avec magic persiste magic", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "k",
        name: "N",
        attackDefenseKind: "magic",
        magicSchool: "sacred", // un skill magic exige une école (cohérence serveur)
      });
      expect(created.attackDefenseKind).toBe("magic");
    });

    it("update physical → magic", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ attackDefenseKind: "physical" }));
      const updated = await service.updateDefinition("power_strike", {
        attackDefenseKind: "magic",
        magicSchool: "sacred",
      });
      expect(updated.attackDefenseKind).toBe("magic");
    });

    it("update magic → physical", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ attackDefenseKind: "magic" }));
      const updated = await service.updateDefinition("power_strike", { attackDefenseKind: "physical" });
      expect(updated.attackDefenseKind).toBe("physical");
    });

    it("update sans attackDefenseKind conserve la valeur existante", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ attackDefenseKind: "magic" }));
      const updated = await service.updateDefinition("power_strike", { name: "Renamed" });
      expect(updated.attackDefenseKind).toBe("magic");
    });

    it("attackDefenseKind est un axe distinct de damageType (aucun couplage)", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ damageType: "raw", attackDefenseKind: "physical" }));
      const updated = await service.updateDefinition("power_strike", {
        attackDefenseKind: "magic",
        magicSchool: "sacred",
      });
      expect(updated.attackDefenseKind).toBe("magic");
      expect(updated.damageType).toBe("raw"); // inchangé
    });
  });

  describe("magicSchool (ADR-0022 — lot fondation)", () => {
    it("création sans magicSchool → null par défaut (skill physique)", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({ key: "strike", name: "Strike" });
      expect(created.magicSchool).toBeNull();
      expect(created.attackDefenseKind).toBe("physical");
    });

    it("Strike : physical sans école accepté", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "strike",
        name: "Strike",
        attackDefenseKind: "physical",
        damageType: "physical",
      });
      expect(created.magicSchool).toBeNull();
    });

    it("Heal : magic + sacred accepté et persisté", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "heal",
        name: "Heal",
        effectType: "heal",
        targetMode: "self",
        attackDefenseKind: "magic",
        magicSchool: "sacred",
      });
      expect(created.magicSchool).toBe("sacred");
      expect(created.attackDefenseKind).toBe("magic");
      expect(created.effectType).toBe("heal"); // reste un soin
    });

    it("refuse une école magique sur un skill physical", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "k",
          name: "N",
          attackDefenseKind: "physical",
          magicSchool: "fire",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuse un skill magic sans école (ex : Heal sans sacred)", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "heal",
          name: "Heal",
          effectType: "heal",
          targetMode: "self",
          attackDefenseKind: "magic",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("update : remise explicite à null autorisée pour un skill physical", async () => {
      repo.findOne.mockResolvedValue(
        makeSkill({ attackDefenseKind: "physical", magicSchool: null }),
      );
      const updated = await service.updateDefinition("power_strike", {
        magicSchool: null,
      });
      expect(updated.magicSchool).toBeNull();
    });

    it("update : basculer une école sur un skill physical existant est refusé", async () => {
      repo.findOne.mockResolvedValue(
        makeSkill({ attackDefenseKind: "physical", magicSchool: null }),
      );
      await expect(
        service.updateDefinition("power_strike", { magicSchool: "fire" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("update d'un champ sans rapport n'impose pas la cohérence à une ligne legacy", async () => {
      // Ligne legacy incohérente (magic sans école) : un patch de nom ne doit
      // pas échouer (la cohérence n'est vérifiée que si le patch touche les axes).
      repo.findOne.mockResolvedValue(
        makeSkill({ attackDefenseKind: "magic", magicSchool: null }),
      );
      const updated = await service.updateDefinition("power_strike", { name: "Renamed" });
      expect(updated.name).toBe("Renamed");
    });

    // ── Verrou canonique heal = magic + sacred ────────────────────────────────
    it("création heal + magic + sacred acceptée", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "heal",
        name: "Heal",
        attackDefenseKind: "magic",
        magicSchool: "sacred",
      });
      expect(created.magicSchool).toBe("sacred");
    });

    it("création heal + magic + fire rejetée (verrou canonique)", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "heal",
          name: "Heal",
          attackDefenseKind: "magic",
          magicSchool: "fire",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("création heal + magic + null rejetée", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "heal",
          name: "Heal",
          attackDefenseKind: "magic",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("création heal + physical + null rejetée (attackDefenseKind canonique)", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "heal",
          name: "Heal",
          attackDefenseKind: "physical",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("update heal sacred + patch magicSchool=fire rejeté", async () => {
      repo.findOne.mockResolvedValue(
        makeSkill({ key: "heal", attackDefenseKind: "magic", magicSchool: "sacred" }),
      );
      await expect(
        service.updateDefinition("heal", { magicSchool: "fire" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("update heal sacred + patch attackDefenseKind=physical rejeté", async () => {
      repo.findOne.mockResolvedValue(
        makeSkill({ key: "heal", attackDefenseKind: "magic", magicSchool: "sacred" }),
      );
      await expect(
        service.updateDefinition("heal", { attackDefenseKind: "physical" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("update heal sacred + patch sans rapport (cooldownMs) accepté", async () => {
      repo.findOne.mockResolvedValue(
        makeSkill({ key: "heal", attackDefenseKind: "magic", magicSchool: "sacred" }),
      );
      const updated = await service.updateDefinition("heal", { cooldownMs: 5000 });
      expect(updated.cooldownMs).toBe(5000);
      expect(updated.magicSchool).toBe("sacred");
    });

    it("le verrou sacred ne s'applique pas aux autres skills magiques (fireball + fire)", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "fireball",
        name: "Fireball",
        attackDefenseKind: "magic",
        magicSchool: "fire",
      });
      expect(created.magicSchool).toBe("fire");
    });

    // ── damageType = magic (ADR-0022 mitigation) : école obligatoire ──────────
    it("création damageType magic + école + effectType damage acceptée", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "fireball",
        name: "Fireball",
        effectType: "damage",
        damageType: "magic",
        attackDefenseKind: "magic",
        magicSchool: "fire",
      });
      expect(created.damageType).toBe("magic");
      expect(created.magicSchool).toBe("fire");
    });

    it("création damageType magic SANS école rejetée (aucun fallback)", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "fireball",
          name: "Fireball",
          effectType: "damage",
          damageType: "magic",
          attackDefenseKind: "magic",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("création damageType magic sur un effet non-dégât (heal) rejetée", async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.createDefinition({
          key: "weird",
          name: "Weird",
          effectType: "heal",
          targetMode: "self",
          damageType: "magic",
          attackDefenseKind: "magic",
          magicSchool: "sacred",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("update damageType → magic sans école rejeté", async () => {
      repo.findOne.mockResolvedValue(
        makeSkill({ key: "spell", effectType: "damage", attackDefenseKind: "magic", magicSchool: null, damageType: "physical" }),
      );
      await expect(
        service.updateDefinition("spell", { damageType: "magic" }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("Heal reste un soin non magique-dommageable (damageType physical par défaut)", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "heal",
        name: "Heal",
        effectType: "heal",
        targetMode: "self",
        attackDefenseKind: "magic",
        magicSchool: "sacred",
      });
      expect(created.effectType).toBe("heal");
      expect(created.damageType).toBe("physical"); // jamais magic → aucune mitigation
    });
  });

  describe("flags défensifs (Lot A)", () => {
    it("création sans flags → défauts (dodge true, block true, parry false)", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({ key: "k", name: "N" });
      expect(created.canBeDodged).toBe(true);
      expect(created.canBeBlocked).toBe(true);
      expect(created.canBeParried).toBe(false); // skills non parables par défaut
    });

    it("création accepte les 3 flags booléens", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "cleave",
        name: "Cleave",
        canBeDodged: false,
        canBeBlocked: false,
        canBeParried: true,
      });
      expect(created.canBeDodged).toBe(false);
      expect(created.canBeBlocked).toBe(false);
      expect(created.canBeParried).toBe(true);
    });

    it("update canBeParried false → true", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ canBeParried: false }));
      const updated = await service.updateDefinition("power_strike", { canBeParried: true });
      expect(updated.canBeParried).toBe(true);
    });

    it("update canBeDodged true → false", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ canBeDodged: true }));
      const updated = await service.updateDefinition("power_strike", { canBeDodged: false });
      expect(updated.canBeDodged).toBe(false);
    });

    it("update canBeBlocked true → false", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ canBeBlocked: true }));
      const updated = await service.updateDefinition("power_strike", { canBeBlocked: false });
      expect(updated.canBeBlocked).toBe(false);
    });

    it("update sans flags conserve les valeurs existantes", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ canBeDodged: false, canBeBlocked: false, canBeParried: true }));
      const updated = await service.updateDefinition("power_strike", { name: "Renamed" });
      expect(updated.canBeDodged).toBe(false);
      expect(updated.canBeBlocked).toBe(false);
      expect(updated.canBeParried).toBe(true);
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

    it("rend exécutable un coût mana > 0 (consommé au cast V1-J-B)", async () => {
      repo.find.mockResolvedValue([
        makeSkill({ key: "mana", resourceType: "mana", resourceCost: 10 }),
      ]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res).toHaveLength(1);
      expect(res[0].executable).toBe(true);
      expect(res[0].disabledReason).toBeUndefined();
    });

    it("rend exécutable un coût energy > 0 (consommé au cast V1-J-B)", async () => {
      repo.find.mockResolvedValue([
        makeSkill({ key: "energy", resourceType: "energy", resourceCost: 5 }),
      ]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res).toHaveLength(1);
      expect(res[0].executable).toBe(true);
      expect(res[0].disabledReason).toBeUndefined();
    });

    it("marque non exécutable un type de ressource inconnu (donnée corrompue)", async () => {
      repo.find.mockResolvedValue([
        makeSkill({ key: "weird", resourceType: "stamina" as never, resourceCost: 5 }),
      ]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res[0].executable).toBe(false);
      expect(res[0].disabledReason).toMatch(/inconnu/i);
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

    it("rend exécutable un heal/self avec coût mana > 0 (consommé au cast)", async () => {
      repo.find.mockResolvedValue([
        makeSkill({ key: "h", targetMode: "self", effectType: "heal", resourceType: "mana", resourceCost: 5 }),
      ]);
      const res = await service.getUsableSkillsForCharacter("char-1", 10, {});
      expect(res[0].executable).toBe(true);
      expect(res[0].disabledReason).toBeUndefined();
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

  describe("getCharacterSkillUnlocks (vue admin)", () => {
    it("expose tout le catalogue avec l'état résolu (dont passive/aura)", async () => {
      repo.find.mockResolvedValue([
        makeSkill({ id: "a", key: "auto_active", autoUnlock: true }),
        makeSkill({ id: "b", key: "locked_active", autoUnlock: false }),
        makeSkill({ id: "c", key: "learned_active", autoUnlock: false }),
        makeSkill({ id: "d", key: "a_passive", skillKind: "passive", autoUnlock: false }),
      ]);
      const now = new Date();
      unlockRepo.find.mockResolvedValue([
        { skillDefinitionId: "c", source: "admin", unlockedAt: now },
        { skillDefinitionId: "d", source: "quest", unlockedAt: now },
      ]);

      const rows = await service.getCharacterSkillUnlocks("char-1");
      const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));

      // autoUnlock global → unlocked sans ligne
      expect(byKey["auto_active"]).toMatchObject({ explicitlyUnlocked: false, unlocked: true, source: null });
      // verrouillé
      expect(byKey["locked_active"]).toMatchObject({ explicitlyUnlocked: false, unlocked: false });
      // débloqué explicitement
      expect(byKey["learned_active"]).toMatchObject({ explicitlyUnlocked: true, unlocked: true, source: "admin" });
      // passive visible + débloquable (visibilité admin)
      expect(byKey["a_passive"]).toMatchObject({ skillKind: "passive", explicitlyUnlocked: true, unlocked: true, source: "quest" });
      expect(rows).toHaveLength(4);
    });
  });

  // ── canCrit + normalisation des flags combat (règle critique canonique) ─────
  describe("canCrit & normalisation des flags combat", () => {
    it("création physical + canCrit true → conservé true", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "phys_crit", name: "Phys", effectType: "damage", damageType: "physical", canCrit: true,
      } as any);
      expect(created.canCrit).toBe(true);
    });

    it("création physical + canCrit OMIS → défaut true (nouveau skill physique critiquable)", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "phys_default", name: "Phys", effectType: "damage", damageType: "physical",
      } as any);
      expect(created.canCrit).toBe(true);
    });

    it("création physical + canCrit false explicite → conservé false", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "phys_nocrit", name: "Phys", effectType: "damage", damageType: "physical", canCrit: false,
      } as any);
      expect(created.canCrit).toBe(false);
    });

    it("update physical SANS canCrit → valeur existante conservée (false)", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ key: "keep", damageType: "physical", canCrit: false }));
      const updated = await service.updateDefinition("keep", { name: "Renommé" } as any);
      expect(updated.canCrit).toBe(false); // PATCH sans canCrit ne réactive jamais
    });

    it("update physical SANS canCrit sur un skill critiquable → true conservé", async () => {
      repo.findOne.mockResolvedValue(makeSkill({ key: "keep2", damageType: "physical", canCrit: true }));
      const updated = await service.updateDefinition("keep2", { requiredLevel: 3 } as any);
      expect(updated.canCrit).toBe(true);
    });

    it("retour magic → physical (sans canCrit) → reste false (réactivation explicite requise)", async () => {
      repo.findOne.mockResolvedValue(
        makeSkill({ key: "back", damageType: "magic", attackDefenseKind: "magic", magicSchool: "air", canCrit: false, canBeBlocked: false, canBeParried: false }),
      );
      // Passage cohérent vers physical (nature défensive physique + école retirée) ;
      // canCrit N'EST PAS fourni → doit rester false (jamais réactivé implicitement).
      const updated = await service.updateDefinition("back", {
        damageType: "physical", attackDefenseKind: "physical", magicSchool: null,
      } as any);
      expect(updated.canCrit).toBe(false);
    });

    it("création magic + canCrit true → normalisé à false", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "gust", name: "Gust", effectType: "damage", damageType: "magic",
        attackDefenseKind: "magic", magicSchool: "air", canCrit: true,
      } as any);
      expect(created.canCrit).toBe(false);
    });

    it("création raw + canCrit true → normalisé à false (défenses conservées)", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "bleed", name: "Bleed", effectType: "damage", damageType: "raw", canCrit: true,
      } as any);
      expect(created.canCrit).toBe(false);
    });

    it("création heal + canCrit true → normalisé à false", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "soin2", name: "Soin", effectType: "heal", targetMode: "self",
        attackDefenseKind: "magic", magicSchool: "sacred", canCrit: true,
      } as any);
      expect(created.canCrit).toBe(false);
    });

    it("création magic → défenses magiques garanties (attackDefenseKind magic, non blocable, non parable, esquive libre)", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.createDefinition({
        key: "gust2", name: "Gust", effectType: "damage", damageType: "magic",
        magicSchool: "air", canBeBlocked: true, canBeParried: true, canBeDodged: true,
      } as any);
      expect(created.attackDefenseKind).toBe("magic");
      expect(created.canBeBlocked).toBe(false);
      expect(created.canBeParried).toBe(false);
      expect(created.canBeDodged).toBe(true); // esquive reste configurable
    });

    it("update physical → magic : aucune configuration incohérente conservée", async () => {
      repo.findOne.mockResolvedValue(
        makeSkill({ key: "swap", damageType: "physical", attackDefenseKind: "physical", canCrit: true, canBeBlocked: true, canBeParried: true }),
      );
      const updated = await service.updateDefinition("swap", {
        damageType: "magic", magicSchool: "fire",
      } as any);
      expect(updated.canCrit).toBe(false);
      expect(updated.attackDefenseKind).toBe("magic");
      expect(updated.canBeBlocked).toBe(false);
      expect(updated.canBeParried).toBe(false);
    });
  });
});
