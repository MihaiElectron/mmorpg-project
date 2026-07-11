import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ActionBarService } from "./action-bar.service";
import { ActiveSkillsService } from "./active-skills.service";
import { MasteriesService } from "../masteries/masteries.service";
import { CharacterActionBarSlot } from "./entities/character-action-bar-slot.entity";
import { Character } from "../characters/entities/character.entity";
import type { SkillDefinition } from "./entities/skill-definition.entity";

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
    scaling: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("ActionBarService", () => {
  let service: ActionBarService;
  let slotRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  let characterRepo: { findOne: jest.Mock };
  // Vrai ActiveSkillsService avec repos mockés → réutilise evaluateSkillAvailability réel.
  let skillRows: SkillDefinition[];
  let unlockedIds: Set<string>;

  beforeEach(async () => {
    skillRows = [];
    unlockedIds = new Set();
    slotRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
      create: jest.fn().mockImplementation((d) => d),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    characterRepo = { findOne: jest.fn().mockResolvedValue({ id: "c1", level: 10 }) };

    const activeSkills = {
      listDefinitions: jest.fn(async () => skillRows),
      getDefinition: jest.fn(async (key: string) => {
        const found = skillRows.find((s) => s.key === key);
        if (!found) throw new NotFoundException(`Skill "${key}" introuvable.`);
        return found;
      }),
      getUnlockedSkillDefinitionIds: jest.fn(async () => unlockedIds),
      // On délègue au vrai évaluateur pour tester les règles réelles.
      evaluateSkillAvailability: new ActiveSkillsService(
        {} as never,
        {} as never,
      ).evaluateSkillAvailability,
    };
    const masteries = { getCharacterMasteries: jest.fn(async () => []) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionBarService,
        { provide: ActiveSkillsService, useValue: activeSkills },
        { provide: MasteriesService, useValue: masteries },
        { provide: getRepositoryToken(CharacterActionBarSlot), useValue: slotRepo },
        { provide: getRepositoryToken(Character), useValue: characterRepo },
      ],
    }).compile();

    service = module.get(ActionBarService);
  });

  it("GET retourne 8 slots vides par défaut", async () => {
    const { slots } = await service.getActionBar("c1");
    expect(slots).toHaveLength(8);
    expect(slots.every((s) => s.skillKey === null && s.available === false && s.unavailableReason === "empty")).toBe(true);
    expect(slots.map((s) => s.slotIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("PUT équipe un skill actif débloqué (autoUnlock)", async () => {
    skillRows = [makeSkill({ id: "s1", key: "fireball", autoUnlock: true })];
    await service.setActionBarSlot("c1", 0, "fireball");
    // upsert : create + save avec skillDefinitionId, jamais skillKey
    const created = slotRepo.create.mock.calls[0][0];
    expect(created).toEqual({ characterId: "c1", slotIndex: 0, skillDefinitionId: "s1" });
    expect(created).not.toHaveProperty("skillKey");
    expect(slotRepo.save).toHaveBeenCalled();
  });

  it("PUT refuse un skill verrouillé (autoUnlock=false sans unlock)", async () => {
    skillRows = [makeSkill({ id: "s1", key: "locked_skill", autoUnlock: false })];
    unlockedIds = new Set();
    await expect(service.setActionBarSlot("c1", 0, "locked_skill")).rejects.toBeInstanceOf(BadRequestException);
    expect(slotRepo.save).not.toHaveBeenCalled();
  });

  it("PUT équipe un skill verrouillé s'il est débloqué explicitement", async () => {
    skillRows = [makeSkill({ id: "s1", key: "learned", autoUnlock: false })];
    unlockedIds = new Set(["s1"]);
    await service.setActionBarSlot("c1", 3, "learned");
    expect(slotRepo.save).toHaveBeenCalled();
  });

  it("PUT refuse un skill passive", async () => {
    skillRows = [makeSkill({ id: "s1", key: "pas", skillKind: "passive" })];
    await expect(service.setActionBarSlot("c1", 0, "pas")).rejects.toThrow(/non_active/);
    expect(slotRepo.save).not.toHaveBeenCalled();
  });

  it("PUT refuse un skill aura", async () => {
    skillRows = [makeSkill({ id: "s1", key: "aura", skillKind: "aura" })];
    await expect(service.setActionBarSlot("c1", 0, "aura")).rejects.toThrow(/non_active/);
  });

  it("PUT refuse un skill disabled", async () => {
    skillRows = [makeSkill({ id: "s1", key: "off", enabled: false })];
    await expect(service.setActionBarSlot("c1", 0, "off")).rejects.toThrow(/disabled/);
  });

  it("PUT refuse si requiredLevel non atteint", async () => {
    skillRows = [makeSkill({ id: "s1", key: "hi", requiredLevel: 50 })];
    characterRepo.findOne.mockResolvedValue({ id: "c1", level: 10 });
    await expect(service.setActionBarSlot("c1", 0, "hi")).rejects.toThrow(/level_required/);
  });

  it("PUT null vide le slot (delete de la ligne)", async () => {
    await service.setActionBarSlot("c1", 2, null);
    expect(slotRepo.delete).toHaveBeenCalledWith({ characterId: "c1", slotIndex: 2 });
    expect(slotRepo.save).not.toHaveBeenCalled();
  });

  it("PUT refuse slotIndex < 0", async () => {
    await expect(service.setActionBarSlot("c1", -1, "x")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("PUT refuse slotIndex > 7", async () => {
    await expect(service.setActionBarSlot("c1", 8, "x")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("PUT refuse une clé inconnue", async () => {
    skillRows = [];
    await expect(service.setActionBarSlot("c1", 0, "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("ré-équiper le même slot remplace sans doublon (update de la ligne existante)", async () => {
    skillRows = [makeSkill({ id: "s2", key: "newskill" })];
    slotRepo.findOne.mockResolvedValue({ id: "row1", characterId: "c1", slotIndex: 0, skillDefinitionId: "old" });
    await service.setActionBarSlot("c1", 0, "newskill");
    expect(slotRepo.create).not.toHaveBeenCalled();
    const saved = slotRepo.save.mock.calls[0][0];
    expect(saved.skillDefinitionId).toBe("s2");
  });

  it("GET marque available:false (disabled) si le skill équipé devient désactivé", async () => {
    skillRows = [makeSkill({ id: "s1", key: "f", enabled: false })];
    slotRepo.find.mockResolvedValue([{ slotIndex: 0, skillDefinitionId: "s1" }]);
    const { slots } = await service.getActionBar("c1");
    expect(slots[0]).toMatchObject({ skillKey: "f", available: false, unavailableReason: "disabled" });
  });

  it("GET marque available:false (locked) si le skill équipé devient verrouillé", async () => {
    skillRows = [makeSkill({ id: "s1", key: "f", autoUnlock: false })];
    unlockedIds = new Set(); // plus débloqué
    slotRepo.find.mockResolvedValue([{ slotIndex: 1, skillDefinitionId: "s1" }]);
    const { slots } = await service.getActionBar("c1");
    expect(slots[1]).toMatchObject({ skillKey: "f", available: false, unavailableReason: "locked" });
  });

  it("GET renvoie un slot vide si skillDefinitionId est null (skill supprimé)", async () => {
    slotRepo.find.mockResolvedValue([{ slotIndex: 4, skillDefinitionId: null }]);
    const { slots } = await service.getActionBar("c1");
    expect(slots[4]).toMatchObject({ skillKey: null, available: false, unavailableReason: "empty" });
  });

  it("GET expose skillKey (jamais un id interne) pour un slot rempli disponible", async () => {
    skillRows = [makeSkill({ id: "s1", key: "fireball", name: "Fireball" })];
    slotRepo.find.mockResolvedValue([{ slotIndex: 0, skillDefinitionId: "s1" }]);
    const { slots } = await service.getActionBar("c1");
    expect(slots[0]).toMatchObject({
      slotIndex: 0,
      skillKey: "fireball",
      name: "Fireball",
      available: true,
      unavailableReason: null,
    });
    expect(slots[0]).not.toHaveProperty("skillDefinitionId");
  });

  it("GET marque available:true pour un skill à coût mana (prérequis OK, V1-J-B)", async () => {
    skillRows = [makeSkill({ id: "s1", key: "manabolt", resourceType: "mana", resourceCost: 10 })];
    slotRepo.find.mockResolvedValue([{ slotIndex: 0, skillDefinitionId: "s1" }]);
    const { slots } = await service.getActionBar("c1");
    expect(slots[0]).toMatchObject({ skillKey: "manabolt", available: true, unavailableReason: null });
  });

  it("GET marque available:true pour un skill à coût energy (prérequis OK, V1-J-B)", async () => {
    skillRows = [makeSkill({ id: "s1", key: "dash", resourceType: "energy", resourceCost: 5 })];
    slotRepo.find.mockResolvedValue([{ slotIndex: 2, skillDefinitionId: "s1" }]);
    const { slots } = await service.getActionBar("c1");
    expect(slots[2]).toMatchObject({ skillKey: "dash", available: true, unavailableReason: null });
  });

  it("GET marque available:false (unsupported_resource) pour un type de ressource inconnu", async () => {
    skillRows = [makeSkill({ id: "s1", key: "weird", resourceType: "stamina" as never, resourceCost: 5 })];
    slotRepo.find.mockResolvedValue([{ slotIndex: 0, skillDefinitionId: "s1" }]);
    const { slots } = await service.getActionBar("c1");
    expect(slots[0]).toMatchObject({ skillKey: "weird", available: false, unavailableReason: "unsupported_resource" });
  });
});
