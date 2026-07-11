import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MasteriesService } from './masteries.service';
import type { MasteryEffects } from './mastery-effects.calculator';
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
    level: 0,
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
      save: jest.fn((x) => Promise.resolve(x)),
      create: jest.fn((x) => x),
      merge: jest.fn((a, b) => ({ ...a, ...b })),
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
    it('retourne baseXpPerLevel pour passer de 0 à 1', () => {
      const def = makeMasteryDef({ baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      // 100 × (0+1)^1.5 = 100
      expect(service.getNextLevelXp(def, 0)).toBe(100);
    });

    it('retourne la formule correcte pour level 1 (coût 1 → 2)', () => {
      const def = makeMasteryDef({ baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      // 100 × (1+1)^1.5 ≈ 282.8 → arrondi 283
      expect(service.getNextLevelXp(def, 1)).toBe(283);
    });

    it('retourne la formule correcte pour level 2 (coût 2 → 3)', () => {
      const def = makeMasteryDef({ baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      // 100 × (2+1)^1.5 ≈ 519.6 → arrondi 520
      expect(service.getNextLevelXp(def, 2)).toBe(520);
    });

    it('respecte baseXpPerLevel et xpCurveExponent configurés', () => {
      const def = makeMasteryDef({ baseXpPerLevel: 200, xpCurveExponent: 2.0 });
      // 200 × (3+1)^2 = 3200
      expect(service.getNextLevelXp(def, 3)).toBe(3200);
    });

    it('retourne Infinity quand level >= maxLevel', () => {
      const def = makeMasteryDef({ maxLevel: 10 });
      expect(service.getNextLevelXp(def, 10)).toBe(Infinity);
      expect(service.getNextLevelXp(def, 99)).toBe(Infinity);
    });
  });

  // ─── recomputeLevel (pure) ────────────────────────────────────────────────

  describe('recomputeLevel', () => {
    it('reste au level 0 si xp < seuil', () => {
      const def = makeMasteryDef();
      // seuil 0→1 = 100, xp = 50
      const result = service.recomputeLevel(def, 0, 50);
      expect(result).toEqual({ level: 0, xp: 50 });
    });

    it('monte au level 1 quand xp atteint exactement le seuil', () => {
      const def = makeMasteryDef();
      // seuil 0→1 = 100
      const result = service.recomputeLevel(def, 0, 100);
      expect(result).toEqual({ level: 1, xp: 0 });
    });

    it('monte au niveau 1 avec carry-over si xp > seuil', () => {
      const def = makeMasteryDef();
      // seuil 0→1 = 100, xp = 150 → level 1, carry 50
      const result = service.recomputeLevel(def, 0, 150);
      expect(result).toEqual({ level: 1, xp: 50 });
    });

    it('enchaîne plusieurs level ups en un seul appel', () => {
      const def = makeMasteryDef({ baseXpPerLevel: 100, xpCurveExponent: 1.0, maxLevel: 100 });
      // seuil = 100 × (level+1) → 0→1 : 100, 1→2 : 200
      // xp = 350 → 0→1 coûte 100, 1→2 coûte 200 = total 300, reste 50
      const result = service.recomputeLevel(def, 0, 350);
      expect(result.level).toBe(2);
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

    it('crée un PlayerMastery level=0 xp=0 si absent', async () => {
      const def = makeMasteryDef();
      const created = makePlayerMastery({ level: 0, xp: 0 });
      masteryDefRepo.findOne.mockResolvedValue(def);
      playerMasteryRepo.findOne.mockResolvedValue(null);
      playerMasteryRepo.save.mockResolvedValue(created);

      const result = await service.getOrCreatePlayerMastery('char-1', 'crafting');

      expect(playerMasteryRepo.save).toHaveBeenCalledTimes(1);
      expect(playerMasteryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ level: 0, xp: 0 }),
      );
      expect(result.level).toBe(0);
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
      const ps = makePlayerMastery({ level: 0, xp: 0 });
      masteryDefRepo.findOne.mockResolvedValue(def);
      playerMasteryRepo.findOne.mockResolvedValue(ps);
      playerMasteryRepo.save.mockImplementation(async (x) => x);

      const result = await service.addXp('char-1', 'crafting', 50);

      // seuil 0→1 = 100, 0+50 = 50 < 100 → level reste 0
      expect(result.level).toBe(0);
      expect(result.xp).toBe(50);
    });

    it('monte le level 0 → 1 quand le seuil est atteint', async () => {
      const def = makeMasteryDef();
      const ps = makePlayerMastery({ level: 0, xp: 0 });
      masteryDefRepo.findOne.mockResolvedValue(def);
      playerMasteryRepo.findOne.mockResolvedValue(ps);
      playerMasteryRepo.save.mockImplementation(async (x) => x);

      const result = await service.addXp('char-1', 'crafting', 100);

      // seuil 0→1 = 100 → level 1, xp 0
      expect(result.level).toBe(1);
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
    it("retourne tous les masteries enabled pour un personnage neuf (level 0 / xp 0)", async () => {
      const defs = [
        makeMasteryDef({ id: "def-1", key: "smithing", category: "crafting" }),
        makeMasteryDef({ id: "def-2", key: "mining", category: "gathering" }),
      ];
      masteryDefRepo.find.mockResolvedValue(defs);
      playerMasteryRepo.find.mockResolvedValue([]); // aucune progression

      const result = await service.getCharacterMasteries("char-1");

      expect(result).toHaveLength(2);
      expect(result.every((s) => s.level === 0 && s.xp === 0)).toBe(true);
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
      // nextLevelXp recalculé depuis le level progressé, pas depuis 0
      expect(smithing.nextLevelXp).toBe(service.getNextLevelXp(defs[0], 4));
      expect(mining.level).toBe(0);
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

  // ─── CRUD admin des définitions (V1-C-A) ──────────────────────────────────
  describe('getMasteryDefinitionByKey', () => {
    it('retourne la définition trouvée', async () => {
      const def = makeMasteryDef({ key: 'mining' });
      masteryDefRepo.findOne.mockResolvedValue(def);

      const result = await service.getMasteryDefinitionByKey('mining');

      expect(result).toBe(def);
      expect(masteryDefRepo.findOne).toHaveBeenCalledWith({ where: { key: 'mining' } });
    });

    it('lève NotFoundException si absente', async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);
      await expect(service.getMasteryDefinitionByKey('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createMasteryDefinition', () => {
    it('crée une définition quand la key est libre', async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);
      const dto = { key: 'alchemy', name: 'Alchemy', category: 'crafting' };

      const result = await service.createMasteryDefinition(dto);

      expect(masteryDefRepo.create).toHaveBeenCalledWith(dto);
      expect(masteryDefRepo.save).toHaveBeenCalled();
      expect(result).toMatchObject({ key: 'alchemy', name: 'Alchemy' });
    });

    it('lève ConflictException si la key existe déjà', async () => {
      masteryDefRepo.findOne.mockResolvedValue(makeMasteryDef({ key: 'smithing' }));

      await expect(
        service.createMasteryDefinition({ key: 'smithing', name: 'Dup' }),
      ).rejects.toThrow(ConflictException);
      expect(masteryDefRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateMasteryDefinition', () => {
    it('applique un patch partiel (name/category/xp config/enabled) sans toucher la key', async () => {
      const existing = makeMasteryDef({ key: 'smithing', name: 'Smithing', maxLevel: 100 });
      masteryDefRepo.findOne.mockResolvedValue(existing);
      const dto = { name: 'Blacksmithing', category: 'combat', maxLevel: 120, xpCurveExponent: 2, enabled: false };

      const result = await service.updateMasteryDefinition('smithing', dto);

      expect(masteryDefRepo.merge).toHaveBeenCalledWith(existing, dto);
      expect(result).toMatchObject({ key: 'smithing', name: 'Blacksmithing', enabled: false, maxLevel: 120 });
      // La key reste celle de l'entité chargée — jamais dérivée du patch.
      expect(result.key).toBe('smithing');
    });

    it('désactive sans supprimer la définition (enabled=false)', async () => {
      const existing = makeMasteryDef({ key: 'smithing', enabled: true });
      masteryDefRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateMasteryDefinition('smithing', { enabled: false });

      expect(result.enabled).toBe(false);
      // Le CRUD ne touche jamais player_mastery : aucun accès au repo de progression.
      expect(playerMasteryRepo.save).not.toHaveBeenCalled();
      expect(playerMasteryRepo.find).not.toHaveBeenCalled();
    });

    it('lève NotFoundException si la définition est absente', async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateMasteryDefinition('ghost', { enabled: false }),
      ).rejects.toThrow(NotFoundException);
      expect(masteryDefRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── effects (Mastery Effects V2) — sanitization au CRUD ──────────────────
  describe('effects sanitization (V2)', () => {
    const validEffects: MasteryEffects = {
      context: { weaponType: 'dagger' },
      modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 0.5 }],
    };

    it("create sans effects ne touche pas le champ (défaut entity '{}')", async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);

      await service.createMasteryDefinition({ key: 'dagger', name: 'Dagger' });

      const created = masteryDefRepo.create.mock.calls[0][0] as Record<string, unknown>;
      expect(created).not.toHaveProperty('effects');
    });

    it('create avec effects valide → persisté proprement', async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);

      const result = await service.createMasteryDefinition({
        key: 'dagger',
        name: 'Dagger',
        effects: { ...validEffects },
      });

      expect(masteryDefRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ effects: validEffects }),
      );
      expect(result).toMatchObject({ effects: validEffects });
    });

    it('create avec stat non whitelistée → BadRequestException, rien de sauvegardé', async () => {
      masteryDefRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createMasteryDefinition({
          key: 'dagger',
          name: 'Dagger',
          effects: { modifiers: [{ stat: 'stunChance', mode: 'percentPerLevel', value: 1 }] },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(masteryDefRepo.save).not.toHaveBeenCalled();
    });

    it('update legacy combat.damagePercentPerLevel → converti en modifiers[] au stockage', async () => {
      masteryDefRepo.findOne.mockResolvedValue(makeMasteryDef({ key: 'dagger' }));

      const result = await service.updateMasteryDefinition('dagger', {
        effects: {
          context: { weaponType: 'dagger' },
          combat: { damagePercentPerLevel: 0.5 },
        },
      });

      expect(result.effects).toEqual(validEffects);
      expect(result.effects).not.toHaveProperty('combat');
    });

    it('update avec effects valide → persisté proprement', async () => {
      masteryDefRepo.findOne.mockResolvedValue(makeMasteryDef({ key: 'dagger' }));

      const result = await service.updateMasteryDefinition('dagger', {
        effects: { ...validEffects },
      });

      expect(result).toMatchObject({ key: 'dagger', effects: validEffects });
    });

    it('update avec value hors borne → BadRequestException', async () => {
      masteryDefRepo.findOne.mockResolvedValue(makeMasteryDef({ key: 'dagger' }));

      await expect(
        service.updateMasteryDefinition('dagger', {
          effects: {
            context: { weaponType: 'dagger' },
            modifiers: [{ stat: 'physicalAttack', mode: 'percentPerLevel', value: 99 }],
          },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(masteryDefRepo.save).not.toHaveBeenCalled();
    });

    it('update sans effects conserve les effects existants', async () => {
      const existing = makeMasteryDef({ key: 'dagger', effects: { ...validEffects } });
      masteryDefRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateMasteryDefinition('dagger', { name: 'Dague' });

      expect(result).toMatchObject({ name: 'Dague', effects: validEffects });
    });

    it('update effects: {} → efface les effets (remplacement complet)', async () => {
      const existing = makeMasteryDef({ key: 'dagger', effects: { ...validEffects } });
      masteryDefRepo.findOne.mockResolvedValue(existing);

      const result = await service.updateMasteryDefinition('dagger', { effects: {} });

      expect(result.effects).toEqual({});
    });
  });

  // ─── getEnabledMasteryDefinitions — cache (V1-D-B) ────────────────────────
  describe('getEnabledMasteryDefinitions (cache)', () => {
    it("ne lit la DB qu'une seule fois pour des lectures répétées", async () => {
      const defs = [makeMasteryDef({ key: 'dagger' })];
      masteryDefRepo.find.mockResolvedValue(defs);

      const first = await service.getEnabledMasteryDefinitions();
      const second = await service.getEnabledMasteryDefinitions();

      expect(first).toBe(defs);
      expect(second).toBe(defs);
      expect(masteryDefRepo.find).toHaveBeenCalledTimes(1);
      expect(masteryDefRepo.find).toHaveBeenCalledWith({ where: { enabled: true } });
    });

    it('est invalidé par updateMasteryDefinition (relit la DB)', async () => {
      masteryDefRepo.find.mockResolvedValue([makeMasteryDef({ key: 'dagger' })]);
      await service.getEnabledMasteryDefinitions();

      masteryDefRepo.findOne.mockResolvedValue(makeMasteryDef({ key: 'dagger' }));
      await service.updateMasteryDefinition('dagger', { enabled: false });

      await service.getEnabledMasteryDefinitions();
      expect(masteryDefRepo.find).toHaveBeenCalledTimes(2);
    });

    it('est invalidé par createMasteryDefinition (relit la DB)', async () => {
      masteryDefRepo.find.mockResolvedValue([]);
      await service.getEnabledMasteryDefinitions();

      masteryDefRepo.findOne.mockResolvedValue(null);
      await service.createMasteryDefinition({ key: 'dagger', name: 'Dagger' });

      await service.getEnabledMasteryDefinitions();
      expect(masteryDefRepo.find).toHaveBeenCalledTimes(2);
    });
  });

  // ─── evaluateRequiredMasteries (pur, statique) ────────────────────────────
  describe('evaluateRequiredMasteries', () => {
    it("retourne ok pour des requirements vides / null / undefined", () => {
      expect(MasteriesService.evaluateRequiredMasteries({}, {})).toEqual({ ok: true, missing: [] });
      expect(MasteriesService.evaluateRequiredMasteries({}, null)).toEqual({ ok: true, missing: [] });
      expect(MasteriesService.evaluateRequiredMasteries({}, undefined)).toEqual({ ok: true, missing: [] });
    });

    it("ignore un niveau requis <= 0 (considere satisfait)", () => {
      const result = MasteriesService.evaluateRequiredMasteries({}, { smithing: 0, mining: -3 });
      expect(result).toEqual({ ok: true, missing: [] });
    });

    it("requirement level 1 échoue à level 0 et passe à level 1 (départ niveau 0)", () => {
      expect(
        MasteriesService.evaluateRequiredMasteries({ smithing: 0 }, { smithing: 1 }).ok,
      ).toBe(false);
      expect(
        MasteriesService.evaluateRequiredMasteries({ smithing: 1 }, { smithing: 1 }).ok,
      ).toBe(true);
    });

    it("traite une mastery absente comme current 0", () => {
      const result = MasteriesService.evaluateRequiredMasteries({}, { smithing: 5 });
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual([{ key: "smithing", required: 5, current: 0 }]);
    });

    it("signale une mastery de niveau insuffisant", () => {
      const result = MasteriesService.evaluateRequiredMasteries({ smithing: 2 }, { smithing: 5 });
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual([{ key: "smithing", required: 5, current: 2 }]);
    });

    it("retourne ok quand le niveau est suffisant (egal ou superieur)", () => {
      expect(MasteriesService.evaluateRequiredMasteries({ smithing: 5 }, { smithing: 5 }).ok).toBe(true);
      expect(MasteriesService.evaluateRequiredMasteries({ smithing: 7 }, { smithing: 5 }).ok).toBe(true);
    });

    it("echoue si au moins une mastery parmi plusieurs est insuffisante", () => {
      const result = MasteriesService.evaluateRequiredMasteries(
        { smithing: 5, mining: 1 },
        { smithing: 5, mining: 3 },
      );
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual([{ key: "mining", required: 3, current: 1 }]);
    });
  });

  // ─── hasRequiredMasteries (async) ─────────────────────────────────────────
  describe('hasRequiredMasteries', () => {
    it("court-circuite sans lecture DB ni creation quand aucune exigence positive", async () => {
      const result = await service.hasRequiredMasteries("char-1", {});
      expect(result).toEqual({ ok: true, missing: [] });
      // Aucune lecture des masteries ni creation de PlayerMastery pour une simple verification
      expect(masteryDefRepo.find).not.toHaveBeenCalled();
      expect(playerMasteryRepo.find).not.toHaveBeenCalled();
      expect(playerMasteryRepo.save).not.toHaveBeenCalled();
    });

    it("autorise quand le niveau du personnage satisfait l'exigence", async () => {
      masteryDefRepo.find.mockResolvedValue([makeMasteryDef({ id: "def-1", key: "smithing" })]);
      playerMasteryRepo.find.mockResolvedValue([
        makePlayerMastery({ masteryDefinitionId: "def-1", level: 6, xp: 0 }),
      ]);

      const result = await service.hasRequiredMasteries("char-1", { smithing: 5 });

      expect(result.ok).toBe(true);
      // Verification en lecture seule : aucune ligne PlayerMastery creee
      expect(playerMasteryRepo.save).not.toHaveBeenCalled();
    });

    it("refuse quand le niveau est insuffisant et detaille le manque", async () => {
      masteryDefRepo.find.mockResolvedValue([makeMasteryDef({ id: "def-1", key: "smithing" })]);
      playerMasteryRepo.find.mockResolvedValue([
        makePlayerMastery({ masteryDefinitionId: "def-1", level: 2, xp: 0 }),
      ]);

      const result = await service.hasRequiredMasteries("char-1", { smithing: 5 });

      expect(result.ok).toBe(false);
      expect(result.missing).toEqual([{ key: "smithing", required: 5, current: 2 }]);
      expect(playerMasteryRepo.save).not.toHaveBeenCalled();
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

    it('crée un PlayerMastery level=0 xp=0 si absent et attache la def', async () => {
      const def = makeMasteryDef();
      const saved = makePlayerMastery({ level: 0, xp: 0 });
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
      // seuil level 0→1 : 100 × (0+1)^1.5 = 100
      const def = makeMasteryDef({ maxLevel: 100, baseXpPerLevel: 100, xpCurveExponent: 1.5 });
      const ps = makePlayerMastery({ level: 0, xp: 80 });

      // 80 + 50 = 130 ≥ 100 → level 1, xp 30
      const result = await service.applyXpInTx(ps, 50, def, mgr as any);

      expect(result.level).toBe(1);
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
