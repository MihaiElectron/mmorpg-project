import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MasteriesService } from './masteries.service';
import { MasteryDefinition } from './entities/mastery-definition.entity';
import { PlayerMastery } from './entities/player-mastery.entity';

// ─── Factories ───────────────────────────────────────────────────────────────

function makeMasteryDef(
  overrides: Partial<MasteryDefinition> = {},
): MasteryDefinition {
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
  } as MasteryDefinition;
}

function makePlayerMastery(overrides: Partial<PlayerMastery> = {}): PlayerMastery {
  return {
    id: 'ps-1',
    characterId: 'char-1',
    masteryDefinitionId: 'def-1',
    level: 1,
    xp: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PlayerMastery;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

describe('MasteriesService', () => {
  let service: MasteriesService;
  let masteryDefRepo: Record<string, jest.Mock>;
  let playerMasteryRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    masteryDefRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((x) => x),
    };

    playerMasteryRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((x) => x),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MasteriesService,
        { provide: getRepositoryToken(MasteryDefinition), useValue: masteryDefRepo },
        { provide: getRepositoryToken(PlayerMastery), useValue: playerMasteryRepo },
      ],
    }).compile();

    service = module.get<MasteriesService>(MasteriesService);
  });

  // ─── getNextLevelXp (pure) ────────────────────────────────────────────────

  describe('getNextLevelXp', () => {
    it('retourne la formule correcte pour level 1', () => {
      const def = makeMasteryDef({ baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      // 100 × 1^1.5 = 100
      expect(service.getNextLevelXp(def, 1)).toBe(100);
    });

    it('retourne la formule correcte pour level 2', () => {
      const def = makeMasteryDef({ baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      // 100 × 2^1.5 ≈ 282.8 → arrondi 283
      expect(service.getNextLevelXp(def, 2)).toBe(283);
    });

    it('respecte baseXpPerLevel et xpCurveExponent configurés', () => {
      const def = makeMasteryDef({ baseXpPerLevel: 200, xpCurveExponent: 2.0 });
      // 200 × 3^2 = 1800
      expect(service.getNextLevelXp(def, 3)).toBe(1800);
    });

    it('retourne Infinity quand level >= maxLevel', () => {
      const def = makeMasteryDef({ maxLevel: 10 });
      expect(service.getNextLevelXp(def, 10)).toBe(Infinity);
      expect(service.getNextLevelXp(def, 99)).toBe(Infinity);
    });
  });

  // ─── recomputeLevel (pure) ────────────────────────────────────────────────

  describe('recomputeLevel', () => {
    it('reste au level 1 si xp < seuil', () => {
      const def = makeMasteryDef();
      // seuil 1→2 = 100, xp = 50
      const result = service.recomputeLevel(def, 1, 50);
      expect(result).toEqual({ level: 1, xp: 50 });
    });

    it('monte au level 2 quand xp atteint exactement le seuil', () => {
      const def = makeMasteryDef();
      // seuil 1→2 = 100
      const result = service.recomputeLevel(def, 1, 100);
      expect(result).toEqual({ level: 2, xp: 0 });
    });

    it('monte au niveau 2 avec carry-over si xp > seuil', () => {
      const def = makeMasteryDef();
      // seuil 1→2 = 100, xp = 150 → level 2, carry 50
      const result = service.recomputeLevel(def, 1, 150);
      expect(result).toEqual({ level: 2, xp: 50 });
    });

    it('enchaîne plusieurs level ups en un seul appel', () => {
      const def = makeMasteryDef({ baseXpPerLevel: 100, xpCurveExponent: 1.0, maxLevel: 100 });
      // seuil = 100 × level × 1.0 → 1→2 : 100, 2→3 : 200
      // xp = 350 → level 1 coûte 100, level 2 coûte 200 = total 300, reste 50
      const result = service.recomputeLevel(def, 1, 350);
      expect(result.level).toBe(3);
      expect(result.xp).toBe(50);
    });

    it('plafonne au maxLevel et accumule le surplus XP', () => {
      const def = makeMasteryDef({ maxLevel: 2, baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      // maxLevel = 2 : pas de level 3
      const result = service.recomputeLevel(def, 2, 9999);
      expect(result.level).toBe(2);
      expect(result.xp).toBe(9999); // surplus conservé
    });
  });

  // ─── seedDefaultMasteries ────────────────────────────────────────────────────

  describe('seedDefaultMasteries', () => {
    it('insère toutes les DEFAULT_MASTERIES absentes', async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);
      masteryDefRepo.save.mockResolvedValue({ id: 'def-x' });

      await service.seedDefaultMasteries();

      // findOne appelé une fois par mastery défini
      expect(masteryDefRepo.findOne).toHaveBeenCalledTimes(9);
      // save appelé pour chaque mastery absent
      expect(masteryDefRepo.save).toHaveBeenCalledTimes(9);
    });

    it('insère "smithing" avec la bonne category', async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);
      masteryDefRepo.save.mockResolvedValue({ id: 'def-x' });

      await service.seedDefaultMasteries();

      expect(masteryDefRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'smithing', category: 'crafting' }),
      );
    });

    it('insère "mining" avec category gathering', async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);
      masteryDefRepo.save.mockResolvedValue({ id: 'def-x' });

      await service.seedDefaultMasteries();

      expect(masteryDefRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'mining', category: 'gathering' }),
      );
    });

    it('ne modifie pas les masteries déjà existants (seed non destructif)', async () => {
      masteryDefRepo.findOne.mockResolvedValue(makeMasteryDef());

      await service.seedDefaultMasteries();

      expect(masteryDefRepo.save).not.toHaveBeenCalled();
    });

    it('insère seulement les masteries absents (certains présents, certains absents)', async () => {
      // Les 4 premiers présents, les 5 suivants absents
      masteryDefRepo.findOne
        .mockResolvedValueOnce(makeMasteryDef({ key: 'smithing' }))
        .mockResolvedValueOnce(makeMasteryDef({ key: 'woodworking' }))
        .mockResolvedValueOnce(makeMasteryDef({ key: 'mining' }))
        .mockResolvedValueOnce(makeMasteryDef({ key: 'woodcutting' }))
        .mockResolvedValue(null); // two_handed, bow, crossbow, diplomacy, leadership
      masteryDefRepo.save.mockResolvedValue({ id: 'def-x' });

      await service.seedDefaultMasteries();

      expect(masteryDefRepo.save).toHaveBeenCalledTimes(5);
    });
  });

  // ─── getOrCreatePlayerMastery ───────────────────────────────────────────────

  describe('getOrCreatePlayerMastery', () => {
    it('retourne le PlayerMastery existant sans créer', async () => {
      const def = makeMasteryDef();
      const existing = makePlayerMastery();
      masteryDefRepo.findOne.mockResolvedValue(def);
      playerMasteryRepo.findOne.mockResolvedValue(existing);

      const result = await service.getOrCreatePlayerMastery('char-1', 'crafting');

      expect(result).toBe(existing);
      expect(playerMasteryRepo.save).not.toHaveBeenCalled();
    });

    it('crée un PlayerMastery level=1 xp=0 si absent', async () => {
      const def = makeMasteryDef();
      const created = makePlayerMastery({ level: 1, xp: 0 });
      masteryDefRepo.findOne.mockResolvedValue(def);
      playerMasteryRepo.findOne.mockResolvedValue(null);
      playerMasteryRepo.save.mockResolvedValue(created);

      const result = await service.getOrCreatePlayerMastery('char-1', 'crafting');

      expect(playerMasteryRepo.save).toHaveBeenCalledTimes(1);
      expect(result.level).toBe(1);
      expect(result.xp).toBe(0);
    });

    it('lance NotFoundException si la MasteryDefinition est absente', async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getOrCreatePlayerMastery('char-1', 'inexistant'),
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

    it('lance BadRequestException si le mastery est disabled', async () => {
      masteryDefRepo.findOne.mockResolvedValue(makeMasteryDef({ enabled: false }));

      await expect(
        service.addXp('char-1', 'crafting', 10),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lance NotFoundException si le mastery est introuvable', async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addXp('char-1', 'introuvable', 10),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('augmente xp sans changer le level si seuil non atteint', async () => {
      const def = makeMasteryDef();
      const ps = makePlayerMastery({ level: 1, xp: 0 });
      masteryDefRepo.findOne.mockResolvedValue(def);
      playerMasteryRepo.findOne.mockResolvedValue(ps);
      playerMasteryRepo.save.mockImplementation(async (x) => x);

      const result = await service.addXp('char-1', 'crafting', 50);

      // seuil 1→2 = 100, 0+50 = 50 < 100 → level reste 1
      expect(result.level).toBe(1);
      expect(result.xp).toBe(50);
    });

    it('monte le level quand le seuil est atteint', async () => {
      const def = makeMasteryDef();
      const ps = makePlayerMastery({ level: 1, xp: 0 });
      masteryDefRepo.findOne.mockResolvedValue(def);
      playerMasteryRepo.findOne.mockResolvedValue(ps);
      playerMasteryRepo.save.mockImplementation(async (x) => x);

      const result = await service.addXp('char-1', 'crafting', 100);

      // seuil 1→2 = 100 → level 2, xp 0
      expect(result.level).toBe(2);
      expect(result.xp).toBe(0);
    });

    it('ne dépasse pas maxLevel même avec un xpAmount massif', async () => {
      const def = makeMasteryDef({ maxLevel: 3, baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      const ps = makePlayerMastery({ level: 3, xp: 0 });
      masteryDefRepo.findOne.mockResolvedValue(def);
      playerMasteryRepo.findOne.mockResolvedValue(ps);
      playerMasteryRepo.save.mockImplementation(async (x) => x);

      const result = await service.addXp('char-1', 'crafting', 999_999);

      expect(result.level).toBe(3); // plafonné
      expect(result.xp).toBe(999_999); // surplus conservé
    });

    it('retourne le playerMastery inchangé si xpAmount === 0', async () => {
      const def = makeMasteryDef();
      const ps = makePlayerMastery({ level: 5, xp: 42 });
      masteryDefRepo.findOne.mockResolvedValue(def);
      playerMasteryRepo.findOne.mockResolvedValue(ps);

      const result = await service.addXp('char-1', 'crafting', 0);

      expect(result.level).toBe(5);
      expect(result.xp).toBe(42);
      expect(playerMasteryRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── getCharacterMasteries ───────────────────────────────────────────────────

  describe('getCharacterMasteries', () => {
    it("retourne tous les masteries enabled pour un personnage neuf (level 1 / xp 0)", async () => {
      const defs = [
        makeMasteryDef({ id: "def-1", key: "smithing", category: "crafting" }),
        makeMasteryDef({ id: "def-2", key: "mining", category: "gathering" }),
      ];
      masteryDefRepo.find.mockResolvedValue(defs);
      playerMasteryRepo.find.mockResolvedValue([]); // aucune progression

      const result = await service.getCharacterMasteries("char-1");

      expect(result).toHaveLength(2);
      expect(result.every((s) => s.level === 1 && s.xp === 0)).toBe(true);
      expect(result.map((s) => s.key).sort()).toEqual(["mining", "smithing"]);
      // Aucune ligne PlayerMastery créée juste pour l'affichage
      expect(playerMasteryRepo.save).not.toHaveBeenCalled();
    });

    it("conserve la progression existante d'un mastery", async () => {
      const defs = [
        makeMasteryDef({ id: "def-1", key: "smithing" }),
        makeMasteryDef({ id: "def-2", key: "mining" }),
      ];
      masteryDefRepo.find.mockResolvedValue(defs);
      playerMasteryRepo.find.mockResolvedValue([
        makePlayerMastery({ masteryDefinitionId: "def-1", level: 4, xp: 120 }),
      ]);

      const result = await service.getCharacterMasteries("char-1");

      const smithing = result.find((s) => s.key === "smithing")!;
      const mining = result.find((s) => s.key === "mining")!;
      expect(smithing.level).toBe(4);
      expect(smithing.xp).toBe(120);
      // nextLevelXp recalculé depuis le level progressé, pas depuis 1
      expect(smithing.nextLevelXp).toBe(service.getNextLevelXp(defs[0], 4));
      expect(mining.level).toBe(1);
      expect(mining.xp).toBe(0);
    });

    it("ne retourne pas les masteries disabled", async () => {
      // Le repository ne renvoie que les enabled (where enabled:true).
      masteryDefRepo.find.mockResolvedValue([
        makeMasteryDef({ id: "def-1", key: "smithing", enabled: true }),
      ]);
      playerMasteryRepo.find.mockResolvedValue([]);

      const result = await service.getCharacterMasteries("char-1");

      expect(masteryDefRepo.find).toHaveBeenCalledWith({ where: { enabled: true } });
      expect(result.every((s) => s.enabled)).toBe(true);
      expect(result.map((s) => s.key)).toEqual(["smithing"]);
    });
  });

  // ─── getOrCreatePlayerMasteryInTx ──────────────────────────────────────────

  describe('getOrCreatePlayerMasteryInTx', () => {
    let mgr: Record<string, jest.Mock>;

    beforeEach(() => {
      mgr = {
        findOne: jest.fn(),
        save: jest.fn(),
        create: jest.fn((_entity, data) => ({ ...data })),
      };
    });

    it('retourne le PlayerMastery existant sans créer', async () => {
      const def = makeMasteryDef();
      const existing = makePlayerMastery();
      mgr.findOne.mockResolvedValue(existing);

      const result = await service.getOrCreatePlayerMasteryInTx('char-1', def, mgr as any);

      expect(result).toBe(existing);
      expect(mgr.save).not.toHaveBeenCalled();
    });

    it('crée un PlayerMastery level=1 xp=0 si absent et attache la def', async () => {
      const def = makeMasteryDef();
      const saved = makePlayerMastery({ level: 1, xp: 0 });
      mgr.findOne.mockResolvedValue(null);
      mgr.save.mockResolvedValue(saved);

      const result = await service.getOrCreatePlayerMasteryInTx('char-1', def, mgr as any);

      expect(mgr.save).toHaveBeenCalledTimes(1);
      expect(result.masteryDefinition).toBe(def);
    });

    it('recharge le PlayerMastery existant si conflit concurrent (code 23505)', async () => {
      const def = makeMasteryDef();
      const existing = makePlayerMastery();
      const pgError = Object.assign(new Error('unique violation'), { code: '23505' });

      mgr.findOne
        .mockResolvedValueOnce(null)     // première recherche : absent
        .mockResolvedValueOnce(existing); // rechargé après le conflit
      mgr.save.mockRejectedValue(pgError);

      const result = await service.getOrCreatePlayerMasteryInTx('char-1', def, mgr as any);

      expect(result).toBe(existing);
      expect(mgr.findOne).toHaveBeenCalledTimes(2);
    });

    it('remonte les erreurs non-23505', async () => {
      const def = makeMasteryDef();
      const unexpectedError = Object.assign(new Error('DB crash'), { code: '08006' });

      mgr.findOne.mockResolvedValue(null);
      mgr.save.mockRejectedValue(unexpectedError);

      await expect(
        service.getOrCreatePlayerMasteryInTx('char-1', def, mgr as any),
      ).rejects.toThrow('DB crash');
    });
  });

  // ─── applyXpInTx ─────────────────────────────────────────────────────────

  describe('applyXpInTx', () => {
    let mgr: Record<string, jest.Mock>;

    beforeEach(() => {
      mgr = {
        save: jest.fn().mockImplementation((_entity, data) => Promise.resolve(data)),
      };
    });

    it('retourne inchangé si xpAmount === 0 sans écriture', async () => {
      const def = makeMasteryDef();
      const ps = makePlayerMastery({ level: 1, xp: 50 });

      const result = await service.applyXpInTx(ps, 0, def, mgr as any);

      expect(result.level).toBe(1);
      expect(result.xp).toBe(50);
      expect(mgr.save).not.toHaveBeenCalled();
    });

    it('ajoute XP sans level up', async () => {
      const def = makeMasteryDef({ maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      const ps = makePlayerMastery({ level: 1, xp: 0 });

      const result = await service.applyXpInTx(ps, 50, def, mgr as any);

      expect(result.level).toBe(1);
      expect(result.xp).toBe(50);
      expect(mgr.save).toHaveBeenCalledTimes(1);
    });

    it('level up quand le seuil est dépassé', async () => {
      // seuil level 1→2 : 100 × 1^1.5 = 100
      const def = makeMasteryDef({ maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      const ps = makePlayerMastery({ level: 1, xp: 80 });

      // 80 + 50 = 130 ≥ 100 → level 2, xp 30
      const result = await service.applyXpInTx(ps, 50, def, mgr as any);

      expect(result.level).toBe(2);
      expect(result.xp).toBe(30);
    });

    it('plafonne au maxLevel', async () => {
      const def = makeMasteryDef({ maxLevel: 2, baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      const ps = makePlayerMastery({ level: 2, xp: 0 });

      const result = await service.applyXpInTx(ps, 9999, def, mgr as any);

      expect(result.level).toBe(2);
      expect(result.xp).toBe(9999);
    });
  });
});
