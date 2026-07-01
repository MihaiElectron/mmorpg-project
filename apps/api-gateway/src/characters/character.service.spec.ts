import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CharacterService } from './character.service';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item } from '../items/entities/item.entity';
import { DataSource } from 'typeorm';
import { isoScreenToWorldWU, DEFAULT_MAP_ID } from '../common/world-coordinates';
import { InventoryProjectionService } from '../inventory/projection/inventory-projection.service';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { ProgressionService } from '../progression/progression.service';

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
        { provide: getRepositoryToken(Character), useValue: characterRepo },
        { provide: getRepositoryToken(CharacterEquipment), useValue: makeRepo() },
        { provide: getRepositoryToken(Inventory), useValue: makeRepo() },
        { provide: getRepositoryToken(Item), useValue: makeRepo() },
        { provide: DataSource, useValue: {} },
        { provide: InventoryProjectionService, useValue: { project: jest.fn().mockResolvedValue([]) } },
        { provide: ItemTransferService, useValue: { transfer: jest.fn() } },
        { provide: ProgressionService, useValue: { getNextLevelXp: jest.fn().mockResolvedValue(100) } },
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
});
