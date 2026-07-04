import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CraftingService } from './crafting.service';
import { Item } from '../items/entities/item.entity';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingIngredient } from './entities/crafting-ingredient.entity';
import { CraftingResult } from './entities/crafting-result.entity';
import { CraftingStationTemplate } from './entities/crafting-station-template.entity';
import { CraftingStation } from './entities/crafting-station.entity';
import { WorldService } from '../world/world.service';

// Couverture directe de CraftingService.findNearestCompatibleStationOrThrow :
// barrière anti-cheat de proximité station (distance euclidienne WU) réutilisée
// par le lancement d'un CraftJob. Ces règles étaient auparavant testées
// uniquement via le craft instantané legacy (supprimé) — on les fixe ici sur la
// méthode partagée, indépendamment du chemin appelant.

function makeRecipe(stationType = 'forge'): CraftingRecipe {
  return { id: 'recipe-1', key: 'basic_sword', stationType } as CraftingRecipe;
}

function makeStation(
  overrides: Partial<CraftingStation> = {},
): CraftingStation {
  return {
    id: 'station-1',
    templateId: 'tpl-forge',
    mapId: 1,
    worldX: 1200,
    worldY: 1000,
    enabled: true,
    template: {
      stationType: 'forge',
      interactionRadiusWU: 1536,
      enabled: true,
    },
    ...overrides,
  } as CraftingStation;
}

describe('CraftingService — findNearestCompatibleStationOrThrow', () => {
  let service: CraftingService;
  let mockManager: { find: jest.Mock };
  let mockWorldService: { getConnectedPlayerByCharacterId: jest.Mock };

  beforeEach(async () => {
    mockManager = { find: jest.fn().mockResolvedValue([]) };
    mockWorldService = {
      getConnectedPlayerByCharacterId: jest.fn().mockReturnValue({
        socketId: 'socket-1',
        characterId: 'char-1',
        name: 'Hero',
        worldX: 1000,
        worldY: 1000,
        mapId: 1,
        x: 100,
        y: 100,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CraftingService,
        { provide: getRepositoryToken(Item), useValue: {} },
        { provide: getRepositoryToken(CraftingRecipe), useValue: {} },
        { provide: getRepositoryToken(CraftingIngredient), useValue: {} },
        { provide: getRepositoryToken(CraftingResult), useValue: {} },
        { provide: getRepositoryToken(CraftingStationTemplate), useValue: {} },
        { provide: getRepositoryToken(CraftingStation), useValue: {} },
        { provide: WorldService, useValue: mockWorldService },
      ],
    }).compile();

    service = module.get<CraftingService>(CraftingService);
  });

  async function expectStationError(
    expected: Record<string, unknown>,
  ): Promise<BadRequestException> {
    try {
      await service.findNearestCompatibleStationOrThrow(
        'char-1',
        makeRecipe(),
        mockManager as never,
      );
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toEqual(
        expect.objectContaining(expected),
      );
      return err as BadRequestException;
    }
    throw new Error('Expected station BadRequestException');
  }

  it('station compatible à portée : retourne la station la plus proche', async () => {
    const station = makeStation();
    mockManager.find.mockResolvedValue([station]);

    const result = await service.findNearestCompatibleStationOrThrow(
      'char-1',
      makeRecipe(),
      mockManager as never,
    );

    expect(result).toBe(station);
  });

  it('joueur non connecté au monde : CRAFTING_STATION_REQUIRED', async () => {
    mockWorldService.getConnectedPlayerByCharacterId.mockReturnValue(null);

    await expectStationError({
      code: 'CRAFTING_STATION_REQUIRED',
      stationType: 'forge',
    });
    // Pas connecté → aucune requête station émise.
    expect(mockManager.find).not.toHaveBeenCalled();
  });

  it('aucune station : CRAFTING_STATION_REQUIRED', async () => {
    mockManager.find.mockResolvedValue([]);

    await expectStationError({
      code: 'CRAFTING_STATION_REQUIRED',
      stationType: 'forge',
      message: 'Forge requise : aucune station compatible active à portée.',
    });
  });

  it('station disabled : ignorée → CRAFTING_STATION_REQUIRED', async () => {
    mockManager.find.mockResolvedValue([makeStation({ enabled: false })]);

    await expectStationError({
      code: 'CRAFTING_STATION_REQUIRED',
      stationType: 'forge',
    });
  });

  it('template station disabled : ignoré → CRAFTING_STATION_REQUIRED', async () => {
    mockManager.find.mockResolvedValue([
      makeStation({
        template: {
          stationType: 'forge',
          interactionRadiusWU: 1536,
          enabled: false,
        } as never,
      }),
    ]);

    await expectStationError({
      code: 'CRAFTING_STATION_REQUIRED',
      stationType: 'forge',
    });
  });

  it('mauvaise map : ignorée → CRAFTING_STATION_REQUIRED', async () => {
    mockManager.find.mockResolvedValue([makeStation({ mapId: 2 })]);

    await expectStationError({
      code: 'CRAFTING_STATION_REQUIRED',
      stationType: 'forge',
    });
  });

  it('station trop loin : CRAFTING_STATION_OUT_OF_RANGE avec distance + radius', async () => {
    mockManager.find.mockResolvedValue([
      makeStation({ worldX: 5000, worldY: 1000 }),
    ]);

    await expectStationError({
      code: 'CRAFTING_STATION_OUT_OF_RANGE',
      stationType: 'forge',
      nearestDistanceWU: 4000,
      requiredRadiusWU: 1536,
      message: 'Forge trop éloignée.',
    });
  });
});
