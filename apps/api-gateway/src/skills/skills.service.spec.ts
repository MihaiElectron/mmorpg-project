import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { SkillDefinition } from './entities/skill-definition.entity';
import { PlayerSkill } from './entities/player-skill.entity';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeSkillDef(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    id: 'def-1',
    key: 'smithing',
    name: 'Smithing',
    category: 'crafting',
    maxLevel: 100,
    baseXpPerLevel: 100,
    xpCurveExponent: 1.5,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SkillDefinition;
}

function makePlayerSkill(overrides: Partial<PlayerSkill> = {}): PlayerSkill {
  return {
    id: 'ps-1',
    characterId: 'char-1',
    skillDefinitionId: 'def-1',
    level: 1,
    xp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PlayerSkill;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('SkillsService', () => {
  let service: SkillsService;
  let skillDefRepo: Record<string, jest.Mock>;
  let playerSkillRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    skillDefRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((x) => x),
    };

    playerSkillRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((x) => x),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillsService,
        { provide: getRepositoryToken(SkillDefinition), useValue: skillDefRepo },
        { provide: getRepositoryToken(PlayerSkill), useValue: playerSkillRepo },
      ],
    }).compile();

    service = module.get<SkillsService>(SkillsService);
  });

  // ─── getNextLevelXp (pure) ────────────────────────────────────────────────

  describe('getNextLevelXp', () => {
    it('retourne la formule correcte pour level 1', () => {
      const def = makeSkillDef({ baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      // 100 × 1^1.5 = 100
      expect(service.getNextLevelXp(def, 1)).toBe(100);
    });

    it('retourne la formule correcte pour level 2', () => {
      const def = makeSkillDef({ baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      // 100 × 2^1.5 ≈ 282.8 → arrondi 283
      expect(service.getNextLevelXp(def, 2)).toBe(283);
    });

    it('respecte baseXpPerLevel et xpCurveExponent configurés', () => {
      const def = makeSkillDef({ baseXpPerLevel: 200, xpCurveExponent: 2.0 });
      // 200 × 3^2 = 1800
      expect(service.getNextLevelXp(def, 3)).toBe(1800);
    });

    it('retourne Infinity quand level >= maxLevel', () => {
      const def = makeSkillDef({ maxLevel: 10 });
      expect(service.getNextLevelXp(def, 10)).toBe(Infinity);
      expect(service.getNextLevelXp(def, 99)).toBe(Infinity);
    });
  });

  // ─── recomputeLevel (pure) ────────────────────────────────────────────────

  describe('recomputeLevel', () => {
    it('reste au level 1 si xp < seuil', () => {
      const def = makeSkillDef();
      // seuil 1→2 = 100, xp = 50
      const result = service.recomputeLevel(def, 1, 50);
      expect(result).toEqual({ level: 1, xp: 50 });
    });

    it('monte au level 2 quand xp atteint exactement le seuil', () => {
      const def = makeSkillDef();
      // seuil 1→2 = 100
      const result = service.recomputeLevel(def, 1, 100);
      expect(result).toEqual({ level: 2, xp: 0 });
    });

    it('monte au niveau 2 avec carry-over si xp > seuil', () => {
      const def = makeSkillDef();
      // seuil 1→2 = 100, xp = 150 → level 2, carry 50
      const result = service.recomputeLevel(def, 1, 150);
      expect(result).toEqual({ level: 2, xp: 50 });
    });

    it('enchaîne plusieurs level ups en un seul appel', () => {
      const def = makeSkillDef({ baseXpPerLevel: 100, xpCurveExponent: 1.0, maxLevel: 100 });
      // seuil = 100 × level × 1.0 → 1→2 : 100, 2→3 : 200
      // xp = 350 → level 1 coûte 100, level 2 coûte 200 = total 300, reste 50
      const result = service.recomputeLevel(def, 1, 350);
      expect(result.level).toBe(3);
      expect(result.xp).toBe(50);
    });

    it('plafonne au maxLevel et accumule le surplus XP', () => {
      const def = makeSkillDef({ maxLevel: 2, baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      // maxLevel = 2 : pas de level 3
      const result = service.recomputeLevel(def, 2, 9999);
      expect(result.level).toBe(2);
      expect(result.xp).toBe(9999); // surplus conservé
    });
  });

  // ─── seedDefaultSkills ────────────────────────────────────────────────────

  describe('seedDefaultSkills', () => {
    it('insère toutes les DEFAULT_SKILLS absentes', async () => {
      skillDefRepo.findOne.mockResolvedValue(null);
      skillDefRepo.save.mockResolvedValue({ id: 'def-x' });

      await service.seedDefaultSkills();

      // findOne appelé une fois par skill défini
      expect(skillDefRepo.findOne).toHaveBeenCalledTimes(9);
      // save appelé pour chaque skill absent
      expect(skillDefRepo.save).toHaveBeenCalledTimes(9);
    });

    it('insère "smithing" avec la bonne category', async () => {
      skillDefRepo.findOne.mockResolvedValue(null);
      skillDefRepo.save.mockResolvedValue({ id: 'def-x' });

      await service.seedDefaultSkills();

      expect(skillDefRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'smithing', category: 'crafting' }),
      );
    });

    it('insère "mining" avec category gathering', async () => {
      skillDefRepo.findOne.mockResolvedValue(null);
      skillDefRepo.save.mockResolvedValue({ id: 'def-x' });

      await service.seedDefaultSkills();

      expect(skillDefRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'mining', category: 'gathering' }),
      );
    });

    it('ne modifie pas les skills déjà existants (seed non destructif)', async () => {
      skillDefRepo.findOne.mockResolvedValue(makeSkillDef());

      await service.seedDefaultSkills();

      expect(skillDefRepo.save).not.toHaveBeenCalled();
    });

    it('insère seulement les skills absents (certains présents, certains absents)', async () => {
      // Les 4 premiers présents, les 5 suivants absents
      skillDefRepo.findOne
        .mockResolvedValueOnce(makeSkillDef({ key: 'smithing' }))
        .mockResolvedValueOnce(makeSkillDef({ key: 'woodworking' }))
        .mockResolvedValueOnce(makeSkillDef({ key: 'mining' }))
        .mockResolvedValueOnce(makeSkillDef({ key: 'woodcutting' }))
        .mockResolvedValue(null); // two_handed, bow, crossbow, diplomacy, leadership
      skillDefRepo.save.mockResolvedValue({ id: 'def-x' });

      await service.seedDefaultSkills();

      expect(skillDefRepo.save).toHaveBeenCalledTimes(5);
    });
  });

  // ─── getOrCreatePlayerSkill ───────────────────────────────────────────────

  describe('getOrCreatePlayerSkill', () => {
    it('retourne le PlayerSkill existant sans créer', async () => {
      const def = makeSkillDef();
      const existing = makePlayerSkill();
      skillDefRepo.findOne.mockResolvedValue(def);
      playerSkillRepo.findOne.mockResolvedValue(existing);

      const result = await service.getOrCreatePlayerSkill('char-1', 'crafting');

      expect(result).toBe(existing);
      expect(playerSkillRepo.save).not.toHaveBeenCalled();
    });

    it('crée un PlayerSkill level=1 xp=0 si absent', async () => {
      const def = makeSkillDef();
      const created = makePlayerSkill({ level: 1, xp: 0 });
      skillDefRepo.findOne.mockResolvedValue(def);
      playerSkillRepo.findOne.mockResolvedValue(null);
      playerSkillRepo.save.mockResolvedValue(created);

      const result = await service.getOrCreatePlayerSkill('char-1', 'crafting');

      expect(playerSkillRepo.save).toHaveBeenCalledTimes(1);
      expect(result.level).toBe(1);
      expect(result.xp).toBe(0);
    });

    it('lance NotFoundException si la SkillDefinition est absente', async () => {
      skillDefRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getOrCreatePlayerSkill('char-1', 'inexistant'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── addXp ────────────────────────────────────────────────────────────────

  describe('addXp', () => {
    it('lance BadRequestException si xpAmount < 0', async () => {
      await expect(
        service.addXp('char-1', 'crafting', -1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lance BadRequestException si le skill est disabled', async () => {
      skillDefRepo.findOne.mockResolvedValue(makeSkillDef({ enabled: false }));

      await expect(
        service.addXp('char-1', 'crafting', 10),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lance NotFoundException si le skill est introuvable', async () => {
      skillDefRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addXp('char-1', 'introuvable', 10),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('augmente xp sans changer le level si seuil non atteint', async () => {
      const def = makeSkillDef();
      const ps = makePlayerSkill({ level: 1, xp: 0 });
      skillDefRepo.findOne.mockResolvedValue(def);
      playerSkillRepo.findOne.mockResolvedValue(ps);
      playerSkillRepo.save.mockImplementation(async (x) => x);

      const result = await service.addXp('char-1', 'crafting', 50);

      // seuil 1→2 = 100, 0+50 = 50 < 100 → level reste 1
      expect(result.level).toBe(1);
      expect(result.xp).toBe(50);
    });

    it('monte le level quand le seuil est atteint', async () => {
      const def = makeSkillDef();
      const ps = makePlayerSkill({ level: 1, xp: 0 });
      skillDefRepo.findOne.mockResolvedValue(def);
      playerSkillRepo.findOne.mockResolvedValue(ps);
      playerSkillRepo.save.mockImplementation(async (x) => x);

      const result = await service.addXp('char-1', 'crafting', 100);

      // seuil 1→2 = 100 → level 2, xp 0
      expect(result.level).toBe(2);
      expect(result.xp).toBe(0);
    });

    it('ne dépasse pas maxLevel même avec un xpAmount massif', async () => {
      const def = makeSkillDef({ maxLevel: 3, baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      const ps = makePlayerSkill({ level: 3, xp: 0 });
      skillDefRepo.findOne.mockResolvedValue(def);
      playerSkillRepo.findOne.mockResolvedValue(ps);
      playerSkillRepo.save.mockImplementation(async (x) => x);

      const result = await service.addXp('char-1', 'crafting', 999_999);

      expect(result.level).toBe(3); // plafonné
      expect(result.xp).toBe(999_999); // surplus conservé
    });

    it('retourne le playerSkill inchangé si xpAmount === 0', async () => {
      const def = makeSkillDef();
      const ps = makePlayerSkill({ level: 5, xp: 42 });
      skillDefRepo.findOne.mockResolvedValue(def);
      playerSkillRepo.findOne.mockResolvedValue(ps);

      const result = await service.addXp('char-1', 'crafting', 0);

      expect(result.level).toBe(5);
      expect(result.xp).toBe(42);
      expect(playerSkillRepo.save).not.toHaveBeenCalled();
    });
  });
});
