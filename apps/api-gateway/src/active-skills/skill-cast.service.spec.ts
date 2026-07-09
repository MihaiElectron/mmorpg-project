import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SkillCastService, isSkillCastFailure } from "./skill-cast.service";
import { ActiveSkillsService } from "./active-skills.service";
import { DerivedStatsService } from "../derived-stats/derived-stats.service";
import { MasteriesService } from "../masteries/masteries.service";
import { CreaturesService } from "../creatures/creatures.service";
import { Character } from "../characters/entities/character.entity";
import type { SkillDefinition } from "./entities/skill-definition.entity";

const POSITION = { worldX: 0, worldY: 0, mapId: 1 };
const TARGET_ID = "11111111-1111-4111-8111-111111111111";

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "s1",
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
    rangeWU: 5,
    radiusWU: 0,
    targetMode: "creature",
    effectType: "damage",
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
  let activeSkills: { listDefinitions: jest.Mock };
  let derivedStats: { getDefinitions: jest.Mock };
  let masteries: { getCharacterMasteries: jest.Mock };
  let creatures: { applySkillDamage: jest.Mock };
  let charRepo: { findOne: jest.Mock; update: jest.Mock };

  let currentSkill: SkillDefinition;
  let currentCharacter: Character | null;

  beforeEach(async () => {
    currentSkill = makeSkill();
    currentCharacter = makeCharacter();

    activeSkills = { listDefinitions: jest.fn(async () => [currentSkill]) };
    derivedStats = { getDefinitions: jest.fn(async () => []) };
    masteries = { getCharacterMasteries: jest.fn(async () => []) };
    creatures = {
      applySkillDamage: jest.fn(async () => ({
        success: true,
        dto: { id: TARGET_ID, state: "alive", worldX: 1, worldY: 1, mapId: 1 },
        damage: 17,
        attackerId: "c1",
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

  it("rejette un coût mana (>0) non supporté", async () => {
    currentSkill = makeSkill({ resourceType: "mana", resourceCost: 10 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/mana/i);
    expect(creatures.applySkillDamage).not.toHaveBeenCalled();
  });

  it("rejette un coût energy (>0) non supporté", async () => {
    currentSkill = makeSkill({ resourceType: "energy", resourceCost: 5 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/energy/i);
  });

  it("rejette un coût health léthal (vie insuffisante)", async () => {
    currentSkill = makeSkill({ resourceType: "health", resourceCost: 100 });
    activeSkills.listDefinitions.mockResolvedValue([currentSkill]);
    currentCharacter = makeCharacter({ health: 100 });
    charRepo.findOne.mockResolvedValue(currentCharacter);
    const r = await cast();
    expect(isSkillCastFailure(r) && r.error).toMatch(/vie insuffisante/i);
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
    );
    if (r.success) {
      expect(r.damage).toBe(17); // valeur retournée par la créature (défense appliquée)
      expect(r.cooldownMs).toBe(1000);
    }
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
});
