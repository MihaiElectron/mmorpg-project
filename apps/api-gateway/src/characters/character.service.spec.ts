import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CharacterService, resourceAfterMaxChange } from './character.service';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item } from '../items/entities/item.entity';
import { DataSource } from 'typeorm';
import { isoScreenToWorldWU, DEFAULT_MAP_ID } from '../common/world-coordinates';
import { InventoryProjectionService } from '../inventory/projection/inventory-projection.service';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { ProgressionService } from '../progression/progression.service';
import { WorldService } from '../world/world.service';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';

function makeRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation((a) => Promise.resolve(a)),
    create: jest.fn().mockImplementation((a) => a),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    }),
  };
}

describe('CharacterService.create — initialisation WU (P7-A)', () => {
  let service: CharacterService;
  let characterRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    characterRepo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharacterService,
        { provide: DerivedStatsService, useValue: { getDefinitions: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Character), useValue: characterRepo },
        { provide: getRepositoryToken(CharacterEquipment), useValue: makeRepo() },
        { provide: getRepositoryToken(Inventory), useValue: makeRepo() },
        { provide: getRepositoryToken(Item), useValue: makeRepo() },
        { provide: DataSource, useValue: {} },
        { provide: InventoryProjectionService, useValue: { project: jest.fn().mockResolvedValue([]) } },
        { provide: ItemTransferService, useValue: { transfer: jest.fn() } },
        { provide: ProgressionService, useValue: { getNextLevelXp: jest.fn().mockResolvedValue(100) } },
        { provide: WorldService, useValue: { emitCharacterReload: jest.fn(), emitAdminCharacterDirty: jest.fn() } },
      ],
    }).compile();
    service = module.get<CharacterService>(CharacterService);
  });

  it('initialise worldX à la valeur WU de la position de spawn par défaut', async () => {
    const expectedWU = isoScreenToWorldWU(400, 300);
    await service.create('user-1', { name: 'Hero', sex: 'male' });
    const created = characterRepo.create.mock.calls[0][0];
    expect(created.worldX).toBe(expectedWU.worldX);
  });

  it('initialise worldY à la valeur WU de la position de spawn par défaut', async () => {
    const expectedWU = isoScreenToWorldWU(400, 300);
    await service.create('user-1', { name: 'Hero', sex: 'male' });
    const created = characterRepo.create.mock.calls[0][0];
    expect(created.worldY).toBe(expectedWU.worldY);
  });

  it('initialise mapId à DEFAULT_MAP_ID', async () => {
    await service.create('user-1', { name: 'Hero', sex: 'male' });
    const created = characterRepo.create.mock.calls[0][0];
    expect(created.mapId).toBe(DEFAULT_MAP_ID);
  });

  it('worldX=0, worldY=9600 pour positionX=400, positionY=300 (non-régression formule ADR-0001)', async () => {
    await service.create('user-1', { name: 'Hero', sex: 'male' });
    const created = characterRepo.create.mock.calls[0][0];
    expect(created.worldX).toBe(0);
    expect(created.worldY).toBe(9600);
  });

  it('initialise mana/energy au max dérivé (0 pour un perso frais sans primaires)', async () => {
    await service.create('user-1', { name: 'Hero', sex: 'male' });
    const created = characterRepo.save.mock.calls[0][0];
    // maxMana = int×10 + wis×5 = 0 ; maxEnergy = end×8 + agi×2 = 0.
    expect(created.mana).toBe(0);
    expect(created.energy).toBe(0);
  });
});

describe('CharacterService.findFirstByUserProjected — enrichissement stats (Progression V1)', () => {
  let service: CharacterService;
  let characterRepo: ReturnType<typeof makeRepo>;

  function makeCharacter(overrides: Record<string, unknown> = {}) {
    return {
      id: 'char-1',
      name: 'Hero',
      level: 3,
      health: 100,
      maxHealth: 100,
      experience: 40,
      attack: 12,
      defense: 6,
      baseStrength: 5,
      baseVitality: 4,
      baseEndurance: 2,
      baseAgility: 3,
      baseDexterity: 1,
      baseIntelligence: 0,
      baseWisdom: 0,
      baseCritical: 6,
      unspentStatPoints: 15,
      equipment: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    characterRepo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharacterService,
        { provide: DerivedStatsService, useValue: { getDefinitions: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Character), useValue: characterRepo },
        { provide: getRepositoryToken(CharacterEquipment), useValue: makeRepo() },
        { provide: getRepositoryToken(Inventory), useValue: makeRepo() },
        { provide: getRepositoryToken(Item), useValue: makeRepo() },
        { provide: DataSource, useValue: {} },
        { provide: InventoryProjectionService, useValue: { project: jest.fn().mockResolvedValue([]) } },
        { provide: ItemTransferService, useValue: { transfer: jest.fn() } },
        { provide: ProgressionService, useValue: { getNextLevelXp: jest.fn().mockResolvedValue(283) } },
        { provide: WorldService, useValue: { emitCharacterReload: jest.fn(), emitAdminCharacterDirty: jest.fn() } },
      ],
    }).compile();
    service = module.get<CharacterService>(CharacterService);
  });

  it('expose nextLevelXp, unspentStatPoints et le bloc stats calculé', async () => {
    characterRepo.findOne.mockResolvedValue(makeCharacter());

    const result = (await service.findFirstByUserProjected('user-1')) as any;

    expect(result.nextLevelXp).toBe(283);
    expect(result.unspentStatPoints).toBe(15);
    expect(result.stats).toBeDefined();
    expect(result.stats.base.strength).toBe(5);
    // derived : maxHealth 100 + vitality(4)*10, physicalAttack 12 + strength(5)*2
    expect(result.stats.derived.maxHealth).toBe(140);
    expect(result.stats.derived.physicalAttack).toBe(22);
    // criticalChance = dexterity(1)*0.3 + agility(3)*0.2 (Critique n'est plus une primaire)
    expect(result.stats.derived.criticalChance).toBeCloseTo(0.9);
  });

  it('expose combat.attackRangeWU = 1280 sans arme équipée', async () => {
    characterRepo.findOne.mockResolvedValue(makeCharacter({ equipment: [] }));
    const result = (await service.findFirstByUserProjected('user-1')) as any;
    expect(result.combat).toEqual({ attackRangeWU: 1280 });
  });

  it('expose combat.attackRangeWU = 1280 pour une arme de mêlée range 80', async () => {
    const equipment = [{ slot: 'right-hand', item: { type: 'weapon', range: 80 } }];
    characterRepo.findOne.mockResolvedValue(makeCharacter({ equipment }));
    const result = (await service.findFirstByUserProjected('user-1')) as any;
    expect(result.combat.attackRangeWU).toBe(1280); // 80 × 16
  });

  it('expose combat.attackRangeWU = 4800 pour une arme à distance range 300', async () => {
    const equipment = [{ slot: 'ranged-weapon', item: { type: 'weapon', range: 300 } }];
    characterRepo.findOne.mockResolvedValue(makeCharacter({ equipment }));
    const result = (await service.findFirstByUserProjected('user-1')) as any;
    expect(result.combat.attackRangeWU).toBe(4800); // 300 × 16
  });
});

describe('CharacterService.allocateStats — allocation de points (Progression V1)', () => {
  let service: CharacterService;
  let characterRepo: ReturnType<typeof makeRepo>;
  let worldService: { emitCharacterReload: jest.Mock; emitAdminCharacterDirty: jest.Mock };
  let locked: any; // le Character chargé sous verrou dans la transaction
  let managerFindOne: jest.Mock;
  let managerSave: jest.Mock;

  function makeLockedCharacter(overrides: Record<string, unknown> = {}) {
    return {
      id: 'char-1',
      userId: 'user-1',
      level: 5,
      health: 80,
      maxHealth: 100,
      attack: 12,
      defense: 6,
      baseStrength: 0,
      baseVitality: 0,
      baseEndurance: 0,
      baseAgility: 0,
      baseDexterity: 0,
      baseIntelligence: 0,
      baseWisdom: 0,
      baseCritical: 0,
      unspentStatPoints: 10,
      equipment: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    characterRepo = makeRepo();
    worldService = { emitCharacterReload: jest.fn(), emitAdminCharacterDirty: jest.fn() };
    managerSave = jest.fn().mockImplementation((_entity, data) => Promise.resolve(data));

    const dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => {
        // `find` : équipement chargé par allocateStats (Équipement V1-A) → [] par
        // défaut (aucun bonus → dérivées identiques à avant l'équipement).
        const manager = { findOne: managerFindOne, save: managerSave, find: jest.fn().mockResolvedValue([]) };
        return cb(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharacterService,
        { provide: DerivedStatsService, useValue: { getDefinitions: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Character), useValue: characterRepo },
        { provide: getRepositoryToken(CharacterEquipment), useValue: makeRepo() },
        { provide: getRepositoryToken(Inventory), useValue: makeRepo() },
        { provide: getRepositoryToken(Item), useValue: makeRepo() },
        { provide: DataSource, useValue: dataSource },
        { provide: InventoryProjectionService, useValue: { project: jest.fn().mockResolvedValue([]) } },
        { provide: ItemTransferService, useValue: { transfer: jest.fn() } },
        { provide: ProgressionService, useValue: { getNextLevelXp: jest.fn().mockResolvedValue(283) } },
        { provide: WorldService, useValue: worldService },
      ],
    }).compile();
    service = module.get<CharacterService>(CharacterService);
  });

  function armCharacter(overrides: Record<string, unknown> = {}) {
    locked = makeLockedCharacter(overrides);
    managerFindOne = jest.fn().mockResolvedValue(locked);
    // La projection finale relit le personnage muté.
    characterRepo.findOne.mockImplementation(async () => locked);
  }

  it('décrémente unspentStatPoints et incrémente les base* (multi-stat)', async () => {
    armCharacter({ unspentStatPoints: 10 });
    const result = (await service.allocateStats('user-1', { strength: 3, endurance: 2 })) as any;
    expect(locked.baseStrength).toBe(3);
    expect(locked.baseEndurance).toBe(2);
    expect(locked.unspentStatPoints).toBe(5);
    // Format enrichi identique à /characters/me
    expect(result.stats.base.strength).toBe(3);
    expect(result.nextLevelXp).toBe(283);
    expect(worldService.emitCharacterReload).toHaveBeenCalledWith('char-1');
  });

  it('refuse une valeur négative', async () => {
    armCharacter();
    await expect(service.allocateStats('user-1', { strength: -1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une valeur décimale', async () => {
    armCharacter();
    await expect(service.allocateStats('user-1', { strength: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une somme nulle', async () => {
    armCharacter();
    await expect(service.allocateStats('user-1', { strength: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.allocateStats('user-1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse une somme supérieure aux points disponibles', async () => {
    armCharacter({ unspentStatPoints: 4 });
    await expect(service.allocateStats('user-1', { strength: 3, vitality: 3 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cible toujours le personnage de l\'utilisateur connecté (par userId)', async () => {
    armCharacter();
    await service.allocateStats('user-1', { strength: 1 });
    // Le findOne transactionnel filtre sur userId, pas sur un characterId client.
    expect(managerFindOne).toHaveBeenCalledWith(
      Character,
      expect.objectContaining({ where: { userId: 'user-1' }, lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('lance NotFoundException si aucun personnage', async () => {
    locked = null;
    managerFindOne = jest.fn().mockResolvedValue(null);
    await expect(service.allocateStats('user-1', { strength: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('Vitalité et PV courant', () => {
    it('augmente derived.maxHealth et les PV courants du delta', async () => {
      armCharacter({ health: 80, maxHealth: 100, baseVitality: 0, unspentStatPoints: 10 });
      const result = (await service.allocateStats('user-1', { vitality: 2 })) as any;
      // +2 vitalité → +20 PV max dérivés, PV courants 80 → 100
      expect(result.stats.derived.maxHealth).toBe(120);
      expect(locked.health).toBe(100);
    });

    it('ne dépasse jamais le nouveau PV max dérivé', async () => {
      armCharacter({ health: 118, maxHealth: 100, baseVitality: 2, unspentStatPoints: 10 });
      // maxHealth dérivé avant = 120, health 118. +1 vitalité → delta 10, 118+10=128 capé à 130
      await service.allocateStats('user-1', { vitality: 1 });
      expect(locked.health).toBe(128);
      const derivedMax = 100 + locked.baseVitality * 10; // 130
      expect(locked.health).toBeLessThanOrEqual(derivedMax);
    });
  });

  describe('Mana / Énergie (Skills V1-J-A)', () => {
    it('allouer de l\'Intelligence augmente maxMana et fait monter la mana du delta', async () => {
      armCharacter({ baseIntelligence: 0, unspentStatPoints: 10 });
      // +3 int → maxMana = 3×10 = 30 ; mana 0 → 30
      const result = (await service.allocateStats('user-1', { intelligence: 3 })) as any;
      expect(result.stats.derived.maxMana).toBe(30);
      expect(locked.mana).toBe(30);
    });

    it('allouer de l\'Endurance augmente maxEnergy et fait monter l\'énergie du delta', async () => {
      armCharacter({ baseEndurance: 0, unspentStatPoints: 10 });
      // +2 end → maxEnergy = 2×8 = 16 ; energy 0 → 16
      const result = (await service.allocateStats('user-1', { endurance: 2 })) as any;
      expect(result.stats.derived.maxEnergy).toBe(16);
      expect(locked.energy).toBe(16);
    });

    it('la mana ne dépasse jamais le nouveau maxMana dérivé', async () => {
      // Départ mana 100 (incohérent), max avant = 20 (int 2). +1 int → max 30.
      armCharacter({ baseIntelligence: 2, mana: 100, unspentStatPoints: 10 });
      await service.allocateStats('user-1', { intelligence: 1 });
      expect(locked.mana).toBeLessThanOrEqual(30);
    });
  });
});

describe('CharacterService.previewStats — aperçu sans persistance (Progression V1)', () => {
  let service: CharacterService;
  let characterRepo: ReturnType<typeof makeRepo>;

  function makeCharacter(overrides: Record<string, unknown> = {}) {
    return {
      id: 'char-1',
      userId: 'user-1',
      level: 5,
      health: 80,
      maxHealth: 100,
      attack: 12,
      defense: 6,
      baseStrength: 0,
      baseVitality: 0,
      baseEndurance: 0,
      baseAgility: 0,
      baseDexterity: 0,
      baseIntelligence: 0,
      baseWisdom: 0,
      baseSpirit: 0,
      baseWillpower: 0,
      baseCharisma: 0,
      unspentStatPoints: 10,
      ...overrides,
    };
  }

  beforeEach(async () => {
    characterRepo = makeRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CharacterService,
        { provide: DerivedStatsService, useValue: { getDefinitions: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Character), useValue: characterRepo },
        { provide: getRepositoryToken(CharacterEquipment), useValue: makeRepo() },
        { provide: getRepositoryToken(Inventory), useValue: makeRepo() },
        { provide: getRepositoryToken(Item), useValue: makeRepo() },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: InventoryProjectionService, useValue: { project: jest.fn() } },
        { provide: ItemTransferService, useValue: { transfer: jest.fn() } },
        { provide: ProgressionService, useValue: { getNextLevelXp: jest.fn() } },
        { provide: WorldService, useValue: { emitCharacterReload: jest.fn(), emitAdminCharacterDirty: jest.fn() } },
      ],
    }).compile();
    service = module.get<CharacterService>(CharacterService);
  });

  function arm(overrides: Record<string, unknown> = {}) {
    characterRepo.findOne.mockResolvedValue(makeCharacter(overrides));
  }

  it('renvoie primary reflétant le brouillon et maxHealth dérivé prévisualisé', async () => {
    arm({ maxHealth: 100, baseVitality: 0, unspentStatPoints: 10 });
    // +5 Vitalité → maxHealth dérivé = 100 + 5×10 = 150
    const res = await service.previewStats('user-1', {
      draftPrimaryStats: { strength: 0, vitality: 5, endurance: 0, agility: 0, dexterity: 0, intelligence: 0, wisdom: 0, spirit: 0, willpower: 0, charisma: 0 },
    });
    expect(res.primary.vitality).toBe(5);
    expect(res.derived.maxHealth).toBe(150);
  });

  it("ne persiste rien (aucun save sur le repository)", async () => {
    arm();
    await service.previewStats('user-1', { draftPrimaryStats: { vitality: 3 } });
    expect(characterRepo.save).not.toHaveBeenCalled();
  });

  it('les dérivées répondent au brouillon (physicalAttack augmente avec la Force)', async () => {
    arm({ baseStrength: 0, unspentStatPoints: 10 });
    const low = await service.previewStats('user-1', { draftPrimaryStats: { strength: 0 } });
    const high = await service.previewStats('user-1', { draftPrimaryStats: { strength: 5 } });
    expect(high.derived.physicalAttack).toBeGreaterThan(low.derived.physicalAttack);
  });

  it('rejette une stat inconnue', async () => {
    arm();
    await expect(
      service.previewStats('user-1', { draftPrimaryStats: { luck: 3 } as Record<string, number> }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette une valeur non entière ou négative', async () => {
    arm();
    await expect(service.previewStats('user-1', { draftPrimaryStats: { strength: 1.5 } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.previewStats('user-1', { draftPrimaryStats: { strength: -1 } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette une valeur sous la base permanente (dé-allocation interdite)', async () => {
    arm({ baseStrength: 4 });
    await expect(service.previewStats('user-1', { draftPrimaryStats: { strength: 2 } })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejette un total ajouté supérieur aux points disponibles', async () => {
    arm({ unspentStatPoints: 3, baseStrength: 0, baseVitality: 0 });
    await expect(
      service.previewStats('user-1', { draftPrimaryStats: { strength: 2, vitality: 2 } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('NotFound si aucun personnage', async () => {
    characterRepo.findOne.mockResolvedValue(null);
    await expect(service.previewStats('user-1', { draftPrimaryStats: {} })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('resourceAfterMaxChange (helper V1-J-A)', () => {
  it('max augmente → courant += delta, capé au nouveau max', () => {
    // 10/20 → newMax 35 : delta 15 → 25/35
    expect(resourceAfterMaxChange(10, 20, 35)).toBe(25);
  });

  it('max diminue → clamp au nouveau max', () => {
    // 30/40 → newMax 20 → 20
    expect(resourceAfterMaxChange(30, 40, 20)).toBe(20);
  });

  it('ne dépasse jamais le nouveau max même si courant déjà au-dessus', () => {
    expect(resourceAfterMaxChange(100, 20, 30)).toBe(30);
  });

  it('ne descend jamais sous 0', () => {
    expect(resourceAfterMaxChange(-5, 0, 10)).toBeGreaterThanOrEqual(0);
  });

  it('valeurs non finies traitées défensivement (0)', () => {
    expect(resourceAfterMaxChange(NaN, 0, 0)).toBe(0);
    expect(resourceAfterMaxChange(5, 0, NaN)).toBe(0);
  });
});
