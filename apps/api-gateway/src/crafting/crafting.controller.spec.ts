import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { NotFoundException } from '@nestjs/common';
import { CraftingController } from './crafting.controller';
import { CraftingService } from './crafting.service';
import { CraftJobService } from './craft-job.service';
import { CharacterService } from '../characters/character.service';
import { CraftRequestDto } from './dto/craft-request.dto';
import { Character } from '../characters/entities/character.entity';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { Item } from '../items/entities/item.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCharacter(id = 'char-uuid-1'): Character {
  return { id } as Character;
}

// ─── CraftRequestDto ─────────────────────────────────────────────────────────

describe('CraftRequestDto — validation', () => {
  async function validateDto(raw: object) {
    const dto = plainToInstance(CraftRequestDto, raw);
    return validate(dto);
  }

  // UUID v4 valide pour les tests
  const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

  it('accepte un payload valide', async () => {
    const errors = await validateDto({ recipeId: VALID_UUID, quantity: 5 });
    expect(errors).toHaveLength(0);
  });

  it('rejette quantity = 0', async () => {
    const errors = await validateDto({ recipeId: VALID_UUID, quantity: 0 });
    expect(errors.some((e) => e.property === 'quantity')).toBe(true);
  });

  it('rejette quantity = 100 (> max 99)', async () => {
    const errors = await validateDto({ recipeId: VALID_UUID, quantity: 100 });
    expect(errors.some((e) => e.property === 'quantity')).toBe(true);
  });

  it('rejette quantity non entier', async () => {
    const errors = await validateDto({ recipeId: VALID_UUID, quantity: 1.5 });
    expect(errors.some((e) => e.property === 'quantity')).toBe(true);
  });

  it('rejette recipeId non UUID', async () => {
    const errors = await validateDto({ recipeId: 'not-a-uuid', quantity: 1 });
    expect(errors.some((e) => e.property === 'recipeId')).toBe(true);
  });

  it("n'a pas de champ characterId ni stationId — le client ne peut pas les fournir", () => {
    const dto = new CraftRequestDto();
    expect(Object.prototype.hasOwnProperty.call(dto, 'characterId')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(dto, 'stationId')).toBe(false);
    const keys = Object.getOwnPropertyNames(CraftRequestDto.prototype);
    expect(keys).not.toContain('characterId');
    expect(keys).not.toContain('stationId');
  });
});

// ─── CraftingController ───────────────────────────────────────────────────────

describe('CraftingController', () => {
  let controller: CraftingController;
  let craftingService: Record<string, jest.Mock>;
  let craftJobService: Record<string, jest.Mock>;
  let characterService: Record<string, jest.Mock>;
  let recipeRepo: Record<string, jest.Mock>;
  let itemRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    craftingService = {
      getCraftingStationWorldObjects: jest.fn(),
    };
    craftJobService = {
      launch: jest.fn(),
      listForCharacter: jest.fn().mockResolvedValue([]),
      claim: jest.fn(),
    };

    characterService = {
      findFirstByUser: jest.fn(),
    };
    recipeRepo = {
      find: jest.fn().mockResolvedValue([]),
      // Par défaut : recette instantanée (craftTimeMs = 0).
      findOne: jest.fn().mockResolvedValue({ id: 'recipe-uuid-1', craftTimeMs: 0 }),
    };
    itemRepo = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CraftingController],
      providers: [
        { provide: CraftingService, useValue: craftingService },
        { provide: CraftJobService, useValue: craftJobService },
        { provide: CharacterService, useValue: characterService },
        { provide: getRepositoryToken(CraftingRecipe), useValue: recipeRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
      ],
    }).compile();

    controller = module.get<CraftingController>(CraftingController);
  });

  it('available-recipes retourne les recettes enabled avec ingrédients et résultats', async () => {
    recipeRepo.find.mockResolvedValue([
      {
        id: 'rec-1',
        key: 'forge_recipe',
        name: 'Forge Recipe',
        description: null,
        category: 'smithing',
        requiredSkillKey: 'smithing',
        requiredSkillLevel: 1,
        baseSuccessRate: 1,
        successBonusPerLevel: 0,
        minSuccessRate: 1,
        maxSuccessRate: 1,
        xpReward: 10,
        craftTimeMs: 1000,
        stationType: 'forge',
        ingredients: [
          { id: 'ing-1', itemId: 'item-ore', item: { name: 'Iron Ore', category: 'iron_ore' }, requiredQuantity: 3 },
        ],
        results: [
          { id: 'res-1', itemId: 'item-bar', item: { name: 'Iron Bar', category: 'iron_bar' }, producedQuantity: 1, chance: 1 },
        ],
      } as Partial<CraftingRecipe>,
    ]);

    const result = await controller.getAvailableRecipes();

    expect(recipeRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { enabled: true },
      relations: ['ingredients', 'ingredients.item', 'results', 'results.item'],
    }));
    expect(result).toEqual([
      expect.objectContaining({
        id: 'rec-1',
        stationType: 'forge',
        ingredients: [expect.objectContaining({ itemName: 'Iron Ore', requiredQuantity: 3 })],
        results: [expect.objectContaining({ itemName: 'Iron Bar', producedQuantity: 1 })],
      }),
    ]);
  });

  it('available-recipes filtre par stationType si fourni', async () => {
    await controller.getAvailableRecipes('forge');

    expect(recipeRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { enabled: true, stationType: 'forge' },
    }));
  });

  it('« Fabriquer » (POST craft) crée toujours un CraftJob (mode "job"), jamais de craft instantané joueur', async () => {
    characterService.findFirstByUser.mockResolvedValue(makeCharacter('char-uuid-1'));
    craftJobService.launch.mockResolvedValue(makeJob({ state: 'RUNNING' }));

    const result = await controller.craft(
      { user: { userId: 'user-uuid-1' } },
      { recipeId: 'recipe-uuid-1', quantity: 2 },
    );

    expect(characterService.findFirstByUser).toHaveBeenCalledWith('user-uuid-1');
    expect(craftJobService.launch).toHaveBeenCalledWith('char-uuid-1', 'recipe-uuid-1', 2);
    // Toute fabrication joueur passe par un CraftJob : aucun output matérialisé
    // avant le claim. Le craft instantané n'existe plus dans le domaine.
    expect(result).toMatchObject({ mode: 'job', job: { jobId: 'job-1', state: 'RUNNING' } });
  });

  it("n'utilise jamais un characterId venant du payload (characterId résolu serveur)", async () => {
    characterService.findFirstByUser.mockResolvedValue(makeCharacter('server-resolved-id'));
    craftJobService.launch.mockResolvedValue(makeJob({ state: 'RUNNING' }));

    await controller.craft({ user: { userId: 'user-uuid-1' } }, { recipeId: 'recipe-uuid-1', quantity: 1 });

    expect(craftJobService.launch).toHaveBeenCalledWith('server-resolved-id', 'recipe-uuid-1', 1);
  });

  it('propage l’erreur de launch (ex. recette introuvable)', async () => {
    characterService.findFirstByUser.mockResolvedValue(makeCharacter());
    craftJobService.launch.mockRejectedValue(new NotFoundException('Recette introuvable'));

    await expect(
      controller.craft({ user: { userId: 'u' } }, { recipeId: 'x', quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("propage NotFoundException si le personnage n'existe pas", async () => {
    characterService.findFirstByUser.mockRejectedValue(new NotFoundException('No character found'));

    await expect(
      controller.craft({ user: { userId: 'user-uuid-1' } }, { recipeId: 'recipe-uuid-1', quantity: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("stations/world-objects appelle getCraftingStationWorldObjects sans mapId", async () => {
    craftingService.getCraftingStationWorldObjects.mockResolvedValue([]);
    const result = await controller.getStationWorldObjects(undefined);
    expect(craftingService.getCraftingStationWorldObjects).toHaveBeenCalledWith(undefined);
    expect(result).toEqual([]);
  });

  it("stations/world-objects convertit mapId string en number", async () => {
    craftingService.getCraftingStationWorldObjects.mockResolvedValue([]);
    await controller.getStationWorldObjects("1");
    expect(craftingService.getCraftingStationWorldObjects).toHaveBeenCalledWith(1);
  });

  // ── CraftJob endpoints ──────────────────────────────────────────────────────

  const req = { user: { userId: "user-1" } };

  function makeJob(overrides: any = {}) {
    return {
      id: "job-1",
      recipeId: "rec-1",
      recipeName: "Fondre minerai", // snapshot au lancement
      stationType: "forge",
      quantity: 2,
      state: "COMPLETED",
      startedAt: new Date("2026-07-01T00:00:00Z"),
      finishAt: new Date("2026-07-01T00:10:00Z"),
      completedAt: new Date("2026-07-01T00:10:00Z"),
      claimedAt: null,
      successes: 2,
      failures: 0,
      outputs: [{ itemId: "item-bar", producedQuantity: 1, resolvedQuantity: 2 }],
      ...overrides,
    };
  }

  it("GET jobs : nom depuis le SNAPSHOT + outputs enrichis via Item (jamais la recette)", async () => {
    characterService.findFirstByUser.mockResolvedValue(makeCharacter("char-9"));
    craftJobService.listForCharacter.mockResolvedValue([makeJob()]);
    itemRepo.find.mockResolvedValue([{ id: "item-bar", name: "Lingot de fer", image: "/assets/bar.png" }]);

    const result = await controller.listJobs(req);

    expect(craftJobService.listForCharacter).toHaveBeenCalledWith("char-9");
    // Le nom de recette ne vient JAMAIS de recipeRepo (recette vivante).
    expect(recipeRepo.find).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      recipeName: "Fondre minerai",
      state: "COMPLETED",
      successes: 2,
      outputs: [{ itemId: "item-bar", itemName: "Lingot de fer", itemImage: "/assets/bar.png", quantity: 1, resolvedQuantity: 2 }],
    });
  });

  it("GET jobs : expose ingrédients réservés/consommés, XP accordée, chance output et multiplicateur d'échec", async () => {
    characterService.findFirstByUser.mockResolvedValue(makeCharacter("char-9"));
    craftJobService.listForCharacter.mockResolvedValue([
      makeJob({
        craftTimeMs: 4000,
        grantedCharacterXp: 14,
        grantedSkillXp: 34,
        ingredients: [
          { itemId: "item-ore", objectMode: "STACKABLE", requiredQuantity: 2, reservedQuantity: 4, consumedQuantity: 4 },
        ],
        outputs: [{ itemId: "item-bar", producedQuantity: 1, chance: 0.8, resolvedQuantity: 2 }],
      }),
    ]);
    itemRepo.find.mockResolvedValue([
      { id: "item-bar", name: "Lingot de fer", image: "/assets/bar.png" },
      { id: "item-ore", name: "Minerai de fer", image: null },
    ]);

    const [dto] = await controller.listJobs(req);

    expect(dto).toMatchObject({
      craftTimeMs: 4000,
      grantedCharacterXp: 14,
      grantedSkillXp: 34,
      failureSkillXpMultiplier: 0.25,
      ingredients: [
        {
          itemId: "item-ore",
          itemName: "Minerai de fer",
          itemImage: null,
          objectMode: "STACKABLE",
          requiredQuantity: 2,
          reservedQuantity: 4,
          consumedQuantity: 4,
        },
      ],
      outputs: [{ itemId: "item-bar", chance: 0.8, resolvedQuantity: 2 }],
    });
  });

  it("GET jobs : recipeName reste affichable même si la recette a été supprimée/renommée", async () => {
    // recipeRepo renverrait autre chose ou rien : sans importance, on ne l'utilise pas.
    characterService.findFirstByUser.mockResolvedValue(makeCharacter());
    craftJobService.listForCharacter.mockResolvedValue([makeJob({ recipeName: "Nom au lancement" })]);
    itemRepo.find.mockResolvedValue([]); // item catalogue disparu aussi

    const result = await controller.listJobs(req);

    expect(result[0].recipeName).toBe("Nom au lancement"); // snapshot, pas la recette vivante
    // Fallback item : itemName = itemId si l'Item n'existe plus.
    expect(result[0].outputs[0]).toMatchObject({ itemId: "item-bar", itemName: "item-bar", itemImage: null });
  });

  it("POST jobs/:id/claim renvoie un résumé complet enrichi (nom/image items)", async () => {
    characterService.findFirstByUser.mockResolvedValue(makeCharacter("char-9"));
    craftJobService.claim.mockResolvedValue({
      jobId: "job-1",
      state: "CLAIMED",
      recipeName: "Lame brute",
      quantity: 2,
      successes: 1,
      failures: 1,
      produced: [{ itemId: "item-bar", quantity: 1 }],
      ingredientsConsumed: [{ itemId: "item-ore", quantity: 4 }],
      grantedCharacterXp: 7,
      grantedSkillXp: 21,
      completedAt: null,
      claimedAt: null,
    });
    itemRepo.find.mockResolvedValue([
      { id: "item-bar", name: "Lingot de fer", image: "/assets/bar.png" },
      { id: "item-ore", name: "Minerai de fer", image: null },
    ]);

    const result = await controller.claimJob(req, "job-1");

    expect(craftJobService.claim).toHaveBeenCalledWith("char-9", "job-1");
    expect(result).toMatchObject({
      jobId: "job-1",
      state: "CLAIMED",
      recipeName: "Lame brute",
      quantity: 2,
      successes: 1,
      failures: 1,
      grantedCharacterXp: 7,
      grantedSkillXp: 21,
      produced: [{ itemId: "item-bar", itemName: "Lingot de fer", itemImage: "/assets/bar.png", quantity: 1 }],
      ingredientsConsumed: [{ itemId: "item-ore", itemName: "Minerai de fer", itemImage: null, quantity: 4 }],
    });
  });
});
