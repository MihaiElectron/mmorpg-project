import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SkillCastService, isSkillCastFailure } from "./skill-cast.service";
import { ActiveSkillsService } from "./active-skills.service";
import { DerivedStatsService } from "../derived-stats/derived-stats.service";
import { MasteriesService } from "../masteries/masteries.service";
import { MasteryEffectsService } from "../masteries/mastery-effects.service";
import { CreaturesService } from "../creatures/creatures.service";
import { Character } from "../characters/entities/character.entity";
import { EquipmentSlot } from "../characters/dto/equip-item.dto";
import type { SkillDefinition } from "./entities/skill-definition.entity";

const POSITION = { worldX: 0, worldY: 0, mapId: 1 };
const TARGET_ID = "11111111-1111-4111-8111-111111111111";
// Lot A/B : flags défensifs par défaut passés à applySkillDamage (fixture makeSkill).
const DEFAULT_FLAGS = { canBeDodged: true, canBeBlocked: true, canBeParried: false };

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "s1",
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
    rangeWU: 5,
    radiusWU: 0,
    targetMode: "creature",
    effectType: "damage",
    damageType: "physical",
    attackDefenseKind: "physical",
    magicSchool: null,
    canBeDodged: true,
    canBeBlocked: true,
    canBeParried: false,
    canCrit: true,
    scaling: { primaryCoefficients: { strength: 2 } },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "c1",
    level: 5,
    health: 100,
    maxHealth: 100,
    attack: 0,
    defense: 0,
    baseStrength: 10,
    ...(overrides as object),
  } as Character;
}

describe("SkillCastService", () => {
  let service: SkillCastService;
  let activeSkills: { listDefinitions: jest.Mock; isSkillUnlocked: jest.Mock };
  let derivedStats: { getDefinitions: jest.Mock };
  let masteries: { getCharacterMasteries: jest.Mock; getEnabledMasteryDefinitions: jest.Mock };
  let masteryEffects: { computeCombatEffects: jest.Mock; aggregatePermanentModifiers: jest.Mock };
  let creatures: { applySkillDamage: jest.Mock };
  let charRepo: { findOne: jest.Mock; update: jest.Mock };

  let currentSkill: SkillDefinition;
  let currentCharacter: Character | null;

  beforeEach(async () => {
    currentSkill = makeSkill();
    currentCharacter = makeCharacter();

    activeSkills = {
      listDefinitions: jest.fn(async () => [currentSkill]),
      isSkillUnlocked: jest.fn(async () => true),
    };
    derivedStats = { getDefinitions: jest.fn(async () => []) };
    masteries = {
      getCharacterMasteries: jest.fn(async () => []),
      getEnabledMasteryDefinitions: jest.fn(async () => []),
    };
    // Par défaut : aucun effet de maîtrise (montant inchangé) — les tests
    // V1-D-Skills-B surchargent ce mock. Agrégat permanent vide (V2).
    masteryEffects = {
      computeCombatEffects: jest.fn(() => ({ damagePercent: 0, damageFlat: 0 })),
      aggregatePermanentModifiers: jest.fn(() => ({ percent: {}, flat: {} })),
    };
    creatures = {
      applySkillDamage: jest.fn(async () => ({
        success: true,
        dto: { id: TARGET_ID, state: "alive", worldX: 1, worldY: 1, mapId: 1 },
        damage: 17,
        attackerId: "c1",
        isCritical: false,
        killed: false,
        isDodged: false,
        isBlocked: false,
        blockedDamage: 0,
        isParried: false,
        loot: undefined,
        characterXpUpdate: undefined,
      })),
    };
    charRepo = {
      findOne: jest.fn(async () => currentCharacter),
      update: jest.fn(async () => ({})),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillCastService,
        { provide: ActiveSkillsService, useValue: activeSkills },
        { provide: DerivedStatsService, useValue: derivedStats },
        { provide: MasteriesService, useValue: masteries },
        { provide: MasteryEffectsService, useValue: masteryEffects },
        { provide: CreaturesService, useValue: creatures },
        { provide: getRepositoryToken(Character), useValue: charRepo },
      ],
    }).compile();

    service = module.get(SkillCastService);
  });

  function cast() {
    return service.castCreatureSkill("c1", POSITION, currentSkill.key, TARGET_ID);
  }

  it("rejette un skill inexistant", async () => {
    activeSkills.listDefinitions.mockResolvedValue([]);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/introuvable/i);
    expect(creatures.applySkillDamage).not.toHaveBeenCalled();
  });

  it("rejette un skill désactivé", async () => {
    currentSkill = makeSkill({ enabled: false });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/désactivé/i);
  });

  // ── Garde-fous kind/unlock (V1-H) ───────────────────────────────────────────
  it("rejette un skill passive (non actif)", async () => {
    currentSkill = makeSkill({ skillKind: "passive" });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/non actif/i);
    expect(creatures.applySkillDamage).not.toHaveBeenCalled();
  });

  it("rejette un skill aura (non actif)", async () => {
    currentSkill = makeSkill({ skillKind: "aura" });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/non actif/i);
  });

  it("rejette un skill actif non débloqué (autoUnlock=false, pas d'unlock)", async () => {
    currentSkill = makeSkill({ autoUnlock: false });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    activeSkills.isSkillUnlocked.mockResolvedValue(false);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/non débloqué/i);
    expect(creatures.applySkillDamage).not.toHaveBeenCalled();
  });

  it("autorise un skill actif débloqué (autoUnlock=false + unlock)", async () => {
    currentSkill = makeSkill({ autoUnlock: false });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    activeSkills.isSkillUnlocked.mockResolvedValue(true);
    const r = await cast();
    expect(r.success).toBe(true);
  });

  it("V5-F : statBonuses d'item alimentent le montant et la pénétration du skill damage", async () => {
    // Skill qui scale sur physicalAttack (dérivée) ; item = +10 physicalAttack + 25 armorPen.
    currentSkill = makeSkill({ scaling: { derivedCoefficients: { physicalAttack: 1 } } });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    currentCharacter = makeCharacter({
      equipment: [
        { slot: "right-hand", item: { type: "weapon", statBonuses: { physicalAttack: 10, armorPenetrationPercent: 25 } } },
      ] as unknown as Character["equipment"],
    });
    charRepo.findOne.mockResolvedValue(currentCharacter);
    await cast();
    expect(creatures.applySkillDamage).toHaveBeenCalled();
    const args = creatures.applySkillDamage.mock.calls[0];
    // arg[3] = montant du skill : physicalAttack base 20 (strength 10 × 2) + 10 (item) = 30.
    expect(args[3]).toBe(30);
    // arg[5] = armorPenetrationPercent du lanceur = 25 (item).
    expect(args[5]).toBe(25);
  });

  it("rejette targetMode != creature", async () => {
    currentSkill = makeSkill({ targetMode: "self" });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/créature/i);
  });

  it("rejette effectType != damage", async () => {
    currentSkill = makeSkill({ effectType: "heal" });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/damage/i);
  });

  it("rejette un personnage mort", async () => {
    currentCharacter = makeCharacter({ health: 0 });
    charRepo.findOne.mockResolvedValue(currentCharacter);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/mort/i);
  });

  it("rejette si requiredLevel non atteint", async () => {
    currentSkill = makeSkill({ requiredLevel: 10 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    currentCharacter = makeCharacter({ level: 5 });
    charRepo.findOne.mockResolvedValue(currentCharacter);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/niveau/i);
  });

  it("rejette si une mastery requise est insuffisante", async () => {
    currentSkill = makeSkill({ requiredMasteries: { two_handed: 5 } });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    masteries.getCharacterMasteries.mockResolvedValue([{ key: "two_handed", level: 2 }]);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/mastery/i);
  });

  it("consomme le mana après un cast réussi", async () => {
    currentSkill = makeSkill({ resourceType: "mana", resourceCost: 10 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    currentCharacter = makeCharacter({ mana: 30 });
    charRepo.findOne.mockResolvedValue(currentCharacter);
    const r = await cast();
    expect(r.success).toBe(true);
    expect(charRepo.update).toHaveBeenCalledWith("c1", { mana: 20 });
    if (r.success) expect(r.resources?.mana).toBe(20);
  });

  it("refuse le cast si mana insuffisant (aucun dégât, aucun décrément)", async () => {
    currentSkill = makeSkill({ resourceType: "mana", resourceCost: 10 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    currentCharacter = makeCharacter({ mana: 5 });
    charRepo.findOne.mockResolvedValue(currentCharacter);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/mana insuffisant/i);
    expect(creatures.applySkillDamage).not.toHaveBeenCalled();
    expect(charRepo.update).not.toHaveBeenCalled();
  });

  it("consomme l'énergie après un cast réussi", async () => {
    currentSkill = makeSkill({ resourceType: "energy", resourceCost: 5 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    currentCharacter = makeCharacter({ energy: 12 });
    charRepo.findOne.mockResolvedValue(currentCharacter);
    const r = await cast();
    expect(r.success).toBe(true);
    expect(charRepo.update).toHaveBeenCalledWith("c1", { energy: 7 });
    if (r.success) expect(r.resources?.energy).toBe(7);
  });

  it("refuse le cast si énergie insuffisante", async () => {
    currentSkill = makeSkill({ resourceType: "energy", resourceCost: 5 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    currentCharacter = makeCharacter({ energy: 2 });
    charRepo.findOne.mockResolvedValue(currentCharacter);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/énergie insuffisante/i);
    expect(creatures.applySkillDamage).not.toHaveBeenCalled();
    expect(charRepo.update).not.toHaveBeenCalled();
  });

  it("rejette un coût health léthal (santé insuffisante)", async () => {
    currentSkill = makeSkill({ resourceType: "health", resourceCost: 100 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    currentCharacter = makeCharacter({ health: 100 });
    charRepo.findOne.mockResolvedValue(currentCharacter);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/santé insuffisante/i);
  });

  it("propage un échec côté créature (hors portée)", async () => {
    creatures.applySkillDamage.mockResolvedValue({ success: false, error: "Target out of range" });
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/range/i);
  });

  it("cast réussi applique les dégâts calculés serveur", async () => {
    const r = await cast();
    expect(r.success).toBe(true);
    // scaling strength(10)×2 = 20 → transmis à applySkillDamage
    expect(creatures.applySkillDamage).toHaveBeenCalledWith(
      TARGET_ID,
      "c1",
      POSITION,
      20,
      5,
      0, // V4-B0 : armorPenetrationPercent (0 par défaut)
      "physical", // V4-B : damageType du skill (défaut)
      0, // V4-D : criticalChance (0 par défaut)
      150, // V4-D : criticalDamage (défaut 150)
      0, // V4-G : accuracy (0 par défaut)
      "physical", // V6-B6 : attackDefenseKind du skill (défaut)
      DEFAULT_FLAGS, // Lot A/B : flags défensifs serveur (12e arg)
      null, // ADR-0022 : magicSchool (13e arg — null, skill non magique)
    );
    if (r.success) {
      expect(r.damage).toBe(17); // valeur retournée par la créature (défense appliquée)
      expect(r.cooldownMs).toBe(1000);
      expect(r.skillName).toBe("Power Strike"); // attribution combat log
    }
  });

  it("transmet armorPenetrationPercent dérivé au hook applySkillDamage (V4-B0)", async () => {
    // Une maîtrise permanente ajoute +50 % de pénétration d'armure : la stat
    // dérivée serveur doit être transmise telle quelle au hook skill.
    // Échoue si on repasse à defensePenetration ou si l'argument n'est plus passé.
    masteryEffects.aggregatePermanentModifiers.mockResolvedValue({
      percent: {},
      flat: { armorPenetrationPercent: 50 },
    });
    const r = await cast();
    expect(r.success).toBe(true);
    expect(creatures.applySkillDamage).toHaveBeenCalledWith(
      TARGET_ID,
      "c1",
      POSITION,
      20,
      5,
      50, // armorPenetrationPercent dérivé (0 + flat 50)
      "physical", // V4-B : damageType du skill (défaut)
      0, // criticalChance
      150, // criticalDamage
      0, // accuracy
      "physical", // V6-B6 : attackDefenseKind
      DEFAULT_FLAGS, // Lot A/B : flags défensifs serveur (12e arg)
      null, // ADR-0022 : magicSchool (13e arg — null, skill non magique)
    );
  });

  it("transmet le damageType 'raw' du skill au hook applySkillDamage (V4-B)", async () => {
    // Un skill configuré en dégâts bruts doit propager 'raw' au hook créature.
    currentSkill = makeSkill({ damageType: "raw" });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    const r = await cast();
    expect(r.success).toBe(true);
    expect(creatures.applySkillDamage).toHaveBeenCalledWith(
      TARGET_ID,
      "c1",
      POSITION,
      20,
      5,
      0,
      "raw",
      0, // criticalChance
      150, // criticalDamage
      0, // accuracy
      "physical", // V6-B6 : attackDefenseKind
      DEFAULT_FLAGS, // Lot A/B : flags défensifs serveur (12e arg)
      null, // ADR-0022 : magicSchool (13e arg — null, skill non magique)
    );
  });

  it("V6-B6 : transmet skill.attackDefenseKind 'magic' au hook applySkillDamage (11e arg)", async () => {
    currentSkill = makeSkill({ attackDefenseKind: "magic" });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    const r = await cast();
    expect(r.success).toBe(true);
    const args = creatures.applySkillDamage.mock.calls[0];
    expect(args[10]).toBe("magic"); // attackDefenseKind en 11e position
    expect(args[6]).toBe("physical"); // damageType reste séparé
  });

  it("Lot A/B : transmet les flags défensifs SERVEUR du skill à applySkillDamage (12e arg)", async () => {
    currentSkill = makeSkill({ canBeDodged: false, canBeBlocked: false, canBeParried: true });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    const r = await cast();
    expect(r.success).toBe(true);
    const args = creatures.applySkillDamage.mock.calls[0];
    // 12e arg = objet de flags lu depuis la définition serveur (jamais le client).
    expect(args[11]).toEqual({ canBeDodged: false, canBeBlocked: false, canBeParried: true });
  });

  it("V6-B6 : propage isParried depuis applySkillDamage dans le résultat de cast", async () => {
    creatures.applySkillDamage.mockResolvedValueOnce({
      success: true,
      dto: { id: TARGET_ID, state: "alive", worldX: 1, worldY: 1, mapId: 1 },
      damage: 0,
      attackerId: "c1",
      isCritical: false,
      killed: false,
      isDodged: false,
      isBlocked: false,
      blockedDamage: 0,
      isParried: true,
    });
    const r = await cast();
    expect(r.success).toBe(true);
    if (r.success) expect(r.isParried).toBe(true);
  });

  it("V6-B7 : propage creatureCounterAttack depuis applySkillDamage vers SkillCastResult", async () => {
    const counter = {
      amount: 10, currentHealth: 90, maxHealth: 100, killed: false,
      isCritical: false, isDodged: false, isBlocked: false, isParried: false,
      blockedDamage: 0, isCounterAttack: true as const,
    };
    creatures.applySkillDamage.mockResolvedValueOnce({
      success: true,
      dto: { id: TARGET_ID, state: "alive", worldX: 1, worldY: 1, mapId: 1 },
      damage: 0,
      attackerId: "c1",
      isCritical: false,
      killed: false,
      isDodged: false,
      isBlocked: false,
      blockedDamage: 0,
      isParried: true,
      creatureCounterAttack: counter,
    });
    const r = await cast();
    expect(r.success).toBe(true);
    if (r.success) expect(r.creatureCounterAttack).toEqual(counter);
  });

  it("transmet criticalChance/criticalDamage dérivés au hook applySkillDamage (V4-D)", async () => {
    // Une maîtrise permanente porte la chance critique à 100 % : les deux stats
    // dérivées critiques doivent être transmises telles quelles au hook skill.
    // Échoue si le critique n'est pas branché sur les skills damage.
    masteryEffects.aggregatePermanentModifiers.mockResolvedValue({
      percent: {},
      flat: { criticalChance: 100 },
    });
    const r = await cast();
    expect(r.success).toBe(true);
    expect(creatures.applySkillDamage).toHaveBeenCalledWith(
      TARGET_ID,
      "c1",
      POSITION,
      20,
      5,
      0, // armorPenetrationPercent
      "physical",
      100, // criticalChance dérivé (0 + flat 100)
      150, // criticalDamage (défaut)
      0, // accuracy
      "physical", // V6-B6 : attackDefenseKind
      DEFAULT_FLAGS, // Lot A/B : flags défensifs serveur (12e arg)
      null, // ADR-0022 : magicSchool (13e arg — null, skill non magique)
    );
  });

  it("physical + canCrit false + chance 100 % → critique NON transmis (chance 0)", async () => {
    currentSkill = makeSkill({ canCrit: false }); // physical mais non critiquable
    masteryEffects.aggregatePermanentModifiers.mockResolvedValue({
      percent: {},
      flat: { criticalChance: 100 },
    });
    await cast();
    const args = (creatures.applySkillDamage as jest.Mock).mock.calls[0];
    expect(args[7]).toBe(0); // criticalChance gaté à 0 malgré 100 % dérivé
  });

  it("skill magic (canCrit impossible) + chance 100 % → critique NON transmis (chance 0)", async () => {
    currentSkill = makeSkill({
      damageType: "magic", attackDefenseKind: "magic", magicSchool: "air",
      canBeBlocked: false, canBeParried: false, canCrit: false,
    });
    masteryEffects.aggregatePermanentModifiers.mockResolvedValue({
      percent: {},
      flat: { criticalChance: 100 },
    });
    await cast();
    const args = (creatures.applySkillDamage as jest.Mock).mock.calls[0];
    expect(args[6]).toBe("magic"); // damageType
    expect(args[7]).toBe(0); // magic ne critique jamais
  });

  it("applique le coût de vie et resync sans tuer le lanceur", async () => {
    currentSkill = makeSkill({ resourceType: "health", resourceCost: 20 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    currentCharacter = makeCharacter({ health: 100 });
    charRepo.findOne.mockResolvedValue(currentCharacter);
    const r = await cast();
    expect(charRepo.update).toHaveBeenCalledWith("c1", { health: 80 });
    if (r.success) expect(r.healthCost).toEqual({ amount: 20, health: 80 });
  });

  it("rejette un second cast pendant le cooldown", async () => {
    const first = await cast();
    expect(first.success).toBe(true);
    const second = await cast();
    expect(isSkillCastFailure(second) && second.error).toMatch(/recharge/i);
  });

  it("ne consomme pas de cooldown ni de vie sur échec créature", async () => {
    currentSkill = makeSkill({ resourceType: "health", resourceCost: 20 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    creatures.applySkillDamage.mockResolvedValue({ success: false, error: "Creature already dead" });
    const r = await cast();
    expect(r.success).toBe(false);
    expect(charRepo.update).not.toHaveBeenCalled();
    // cooldown non armé → un nouveau cast repasse les contrôles (échoue encore côté créature, pas cooldown)
    const r2 = await cast();
    expect(isSkillCastFailure(r2) && r2.error).toMatch(/dead/i);
  });

  // ── Bonus de maîtrise d'arme (V1-D-Skills-B) ────────────────────────────────
  describe("bonus de maîtrise d'arme (V1-D-Skills-B)", () => {
    function armedWith(weaponType: string | null) {
      return [
        { slot: EquipmentSlot.RIGHT_HAND, item: { id: "w", type: "weapon", weaponType } },
      ] as unknown as Character["equipment"];
    }

    // Montant de base : scaling strength(10)×2 = 20 (cf. test transmission).

    it("skill weaponType matching + arme équipée + bonus 10 % → montant boosté 22", async () => {
      currentSkill = makeSkill({ weaponType: "two_handed_sword" });
      currentCharacter = makeCharacter({ equipment: armedWith("two_handed_sword") });
      masteries.getEnabledMasteryDefinitions.mockResolvedValue([
        { key: "two_handed", enabled: true, effects: {} },
      ]);
      masteryEffects.computeCombatEffects.mockReturnValue({ damagePercent: 10, damageFlat: 0 });

      const r = await cast();

      expect(r.success).toBe(true);
      // round(20 × 1.10) = 22.
      expect(creatures.applySkillDamage).toHaveBeenCalledWith(
        TARGET_ID,
        "c1",
        POSITION,
        22,
        currentSkill.rangeWU,
        0, // V4-B0 : armorPenetrationPercent (0 par défaut)
        "physical", // V4-B : damageType du skill (défaut)
        0, // criticalChance
        150, // criticalDamage
        0, // accuracy
        "physical", // V6-B6 : attackDefenseKind
        DEFAULT_FLAGS, // Lot A/B : flags défensifs serveur (12e arg)
        null, // ADR-0022 : magicSchool (13e arg — null, skill non magique)
      );
      // Le calcul passe par le calculateur V1-D-A avec le bon contexte,
      // les définitions du cache et les niveaux déjà chargés.
      expect(masteryEffects.computeCombatEffects).toHaveBeenCalledWith(
        [{ key: "two_handed", enabled: true, effects: {} }],
        expect.any(Object),
        { weaponType: "two_handed_sword" },
      );
    });

    it("mauvais weaponType équipé → montant inchangé, calcul non invoqué", async () => {
      currentSkill = makeSkill({ weaponType: "two_handed_sword" });
      currentCharacter = makeCharacter({ equipment: armedWith("bow") });

      const r = await cast();

      expect(r.success).toBe(true);
      expect(creatures.applySkillDamage).toHaveBeenCalledWith(
        TARGET_ID, "c1", POSITION, 20, currentSkill.rangeWU, 0, "physical", 0, 150, 0, "physical", DEFAULT_FLAGS, null,
      );
      expect(masteryEffects.computeCombatEffects).not.toHaveBeenCalled();
    });

    it("skill.weaponType null (sort/magie) → montant inchangé même armé", async () => {
      currentSkill = makeSkill({ weaponType: null });
      currentCharacter = makeCharacter({ equipment: armedWith("two_handed_sword") });
      masteryEffects.computeCombatEffects.mockReturnValue({ damagePercent: 50, damageFlat: 0 });

      const r = await cast();

      expect(r.success).toBe(true);
      expect(creatures.applySkillDamage).toHaveBeenCalledWith(
        TARGET_ID, "c1", POSITION, 20, currentSkill.rangeWU, 0, "physical", 0, 150, 0, "physical", DEFAULT_FLAGS, null,
      );
      expect(masteryEffects.computeCombatEffects).not.toHaveBeenCalled();
    });

    it("aucune arme équipée → montant inchangé", async () => {
      currentSkill = makeSkill({ weaponType: "two_handed_sword" });
      currentCharacter = makeCharacter({ equipment: [] });

      const r = await cast();

      expect(r.success).toBe(true);
      expect(creatures.applySkillDamage).toHaveBeenCalledWith(
        TARGET_ID, "c1", POSITION, 20, currentSkill.rangeWU, 0, "physical", 0, 150, 0, "physical", DEFAULT_FLAGS, null,
      );
      expect(masteryEffects.computeCombatEffects).not.toHaveBeenCalled();
    });

    it("damagePercent 0 (mastery level 1, disabled, effects vides…) → montant inchangé", async () => {
      currentSkill = makeSkill({ weaponType: "two_handed_sword" });
      currentCharacter = makeCharacter({ equipment: armedWith("two_handed_sword") });
      masteryEffects.computeCombatEffects.mockReturnValue({ damagePercent: 0, damageFlat: 0 });

      const r = await cast();

      expect(r.success).toBe(true);
      expect(creatures.applySkillDamage).toHaveBeenCalledWith(
        TARGET_ID, "c1", POSITION, 20, currentSkill.rangeWU, 0, "physical", 0, 150, 0, "physical", DEFAULT_FLAGS, null,
      );
    });

    it("le bonus n'altère ni le coût ressource ni le cooldown", async () => {
      currentSkill = makeSkill({
        weaponType: "two_handed_sword",
        resourceType: "mana",
        resourceCost: 30,
        cooldownMs: 5000,
      });
      currentCharacter = makeCharacter({
        equipment: armedWith("two_handed_sword"),
        mana: 50,
        energy: 0,
      } as Partial<Character>);
      masteryEffects.computeCombatEffects.mockReturnValue({ damagePercent: 10, damageFlat: 0 });

      const r = await cast();

      expect(r.success).toBe(true);
      if (r.success) expect(r.cooldownMs).toBe(5000);
      // Coût décrémenté à l'identique (50 − 30 = 20), indépendant du bonus.
      expect(charRepo.update).toHaveBeenCalledWith("c1", { mana: 20 });
    });
  });

  // ── castSelfSkill (V1-G : soin sur soi) ─────────────────────────────────────
  describe("castSelfSkill", () => {
    function makeHealSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
      return makeSkill({
        key: "heal_self",
        targetMode: "self",
        effectType: "heal",
        scaling: { primaryCoefficients: { strength: 3 } }, // strength 10 × 3 = 30
        ...overrides,
      });
    }
    function castSelf() {
      return service.castSelfSkill("c1", "heal_self");
    }
    function useSkill(skill: SkillDefinition) {
      currentSkill = skill;
      activeSkills.listDefinitions.mockResolvedValue([skill]);
    }
    function useCharacter(char: Character) {
      currentCharacter = char;
      charRepo.findOne.mockResolvedValue(char);
    }

    it("un heal ne reçoit JAMAIS le bonus de maîtrise d'arme (V1-D-Skills-B)", async () => {
      // Même armé et même avec un weaponType configuré par erreur sur le skill,
      // le chemin self/heal ne passe pas par applyWeaponMasteryBonus.
      useSkill(makeHealSkill({ weaponType: "two_handed_sword" }));
      useCharacter(makeCharacter({
        health: 50,
        equipment: [
          { slot: EquipmentSlot.RIGHT_HAND, item: { id: "w", type: "weapon", weaponType: "two_handed_sword" } },
        ] as unknown as Character["equipment"],
      }));
      masteryEffects.computeCombatEffects.mockReturnValue({ damagePercent: 50, damageFlat: 0 });

      const r = await castSelf();

      expect(r.success).toBe(true);
      // Soin de base 30 (strength 10 × 3), non boosté : 50 + 30 = 80.
      if (r.success) expect(r.health).toBe(80);
      expect(masteryEffects.computeCombatEffects).not.toHaveBeenCalled();
    });

    it("soigne et clampe à maxHealth dérivé (~100)", async () => {
      useSkill(makeHealSkill());
      useCharacter(makeCharacter({ health: 50, maxHealth: 100 }));
      const r = await castSelf();
      expect(r.success).toBe(true);
      // 50 + 30 = 80 (< 100)
      expect(charRepo.update).toHaveBeenCalledWith("c1", { health: 80 });
      if (r.success) {
        expect(r.health).toBe(80);
        expect(r.heal).toBe(30);
        expect(r.cooldownMs).toBe(1000);
      }
    });

    it("ne dépasse jamais maxHealth", async () => {
      useSkill(makeHealSkill());
      useCharacter(makeCharacter({ health: 90, maxHealth: 100 }));
      const r = await castSelf();
      expect(charRepo.update).toHaveBeenCalledWith("c1", { health: 100 });
      if (r.success) expect(r.heal).toBe(10);
    });

    it("V5-F : le healingPower d'un item équipé augmente le soin (via calculateSkillEffect)", async () => {
      // Skill qui scale sur la dérivée healingPower (base 0 : wisdom/spirit à 0).
      useSkill(makeHealSkill({ scaling: { derivedCoefficients: { healingPower: 1 } } }));
      useCharacter(makeCharacter({
        health: 50,
        maxHealth: 100,
        equipment: [
          { slot: EquipmentSlot.RIGHT_HAND, item: { id: "w", type: "weapon", statBonuses: { healingPower: 20 } } },
        ] as unknown as Character["equipment"],
      }));
      const r = await castSelf();
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.heal).toBe(20); // healingPower 0 (base) + 20 (item)
        expect(r.health).toBe(70);
      }
    });

    it("rejette un heal passive (non actif) et n'écrit rien", async () => {
      useSkill(makeHealSkill({ skillKind: "passive" }));
      useCharacter(makeCharacter({ health: 50 }));
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/non actif/i);
      expect(charRepo.update).not.toHaveBeenCalled();
    });

    it("rejette un heal actif non débloqué", async () => {
      useSkill(makeHealSkill({ autoUnlock: false }));
      useCharacter(makeCharacter({ health: 50 }));
      activeSkills.isSkillUnlocked.mockResolvedValue(false);
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/non débloqué/i);
      expect(charRepo.update).not.toHaveBeenCalled();
    });

    it("rejette un skill disabled", async () => {
      useSkill(makeHealSkill({ enabled: false }));
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/désactivé/i);
      expect(charRepo.update).not.toHaveBeenCalled();
    });

    it("rejette targetMode != self", async () => {
      useSkill(makeHealSkill({ targetMode: "creature" }));
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/soi/i);
    });

    it("rejette effectType != heal", async () => {
      useSkill(makeHealSkill({ effectType: "damage" }));
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/heal/i);
    });

    it("rejette un personnage mort", async () => {
      useSkill(makeHealSkill());
      useCharacter(makeCharacter({ health: 0 }));
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/mort/i);
      expect(charRepo.update).not.toHaveBeenCalled();
    });

    it("rejette si requiredLevel non atteint", async () => {
      useSkill(makeHealSkill({ requiredLevel: 10 }));
      useCharacter(makeCharacter({ level: 5, health: 50 }));
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/niveau/i);
    });

    it("rejette si une mastery requise est insuffisante", async () => {
      useSkill(makeHealSkill({ requiredMasteries: { restoration: 5 } }));
      masteries.getCharacterMasteries.mockResolvedValue([{ key: "restoration", level: 2 }]);
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/mastery/i);
    });

    it("consomme le mana et soigne dans la même mise à jour", async () => {
      useSkill(makeHealSkill({ resourceType: "mana", resourceCost: 10 }));
      useCharacter(makeCharacter({ health: 50, maxHealth: 100, mana: 30 }));
      const r = await castSelf();
      // Soin 30 → health 80 ; mana 30 - 10 = 20, persistés ensemble.
      expect(charRepo.update).toHaveBeenCalledWith("c1", { health: 80, mana: 20 });
      if (r.success) {
        expect(r.health).toBe(80);
        expect(r.resources?.mana).toBe(20);
      }
    });

    it("refuse le soin si mana insuffisant (aucun décrément)", async () => {
      useSkill(makeHealSkill({ resourceType: "mana", resourceCost: 10 }));
      useCharacter(makeCharacter({ health: 50, mana: 5 }));
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/mana insuffisant/i);
      expect(charRepo.update).not.toHaveBeenCalled();
    });

    it("accepte un coût health non létal (payé avant le soin)", async () => {
      useSkill(makeHealSkill({ resourceType: "health", resourceCost: 20 }));
      useCharacter(makeCharacter({ health: 50, maxHealth: 100 }));
      const r = await castSelf();
      // 50 - 20 (coût) = 30 ; 30 + 30 (soin) = 60
      expect(charRepo.update).toHaveBeenCalledWith("c1", { health: 60 });
      if (r.success) expect(r.health).toBe(60);
    });

    it("rejette un coût health létal", async () => {
      useSkill(makeHealSkill({ resourceType: "health", resourceCost: 100 }));
      useCharacter(makeCharacter({ health: 100 }));
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/santé insuffisante/i);
    });

    it("arme le cooldown après succès et rejette le 2e cast", async () => {
      useSkill(makeHealSkill());
      useCharacter(makeCharacter({ health: 50 }));
      const first = await castSelf();
      expect(first.success).toBe(true);
      const second = await castSelf();
      expect(isSkillCastFailure(second) && second.error).toMatch(/recharge/i);
    });

    it("n'arme aucun cooldown si échec (skill introuvable)", async () => {
      activeSkills.listDefinitions.mockResolvedValue([]);
      const r = await castSelf();
      expect(isSkillCastFailure(r) && r.error).toMatch(/introuvable/i);
      expect(charRepo.update).not.toHaveBeenCalled();
    });
  });
});
