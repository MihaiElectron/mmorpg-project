import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { NotFoundException } from '@nestjs/common';
import { CraftingController } from './crafting.controller';
import { CraftingService } from './crafting.service';
import { CharacterService } from '../characters/character.service';
import { CraftRequestDto } from './dto/craft-request.dto';
import { Character } from '../characters/entities/character.entity';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCharacter(id = 'char-uuid-1'): Character {
  return { id } as Character;
}

function makeCraftResult() {
  return {
    recipeId: 'recipe-uuid-1',
    recipeKey: 'iron_bar_from_ore',
    requestedQuantity: 1,
    attempts: 1,
    successes: 1,
    failures: 0,
    consumed: [{ itemId: 'item-iron_ore', quantity: 3 }],
    produced: [{ itemId: 'item-iron_bar', quantity: 1 }],
    skill: {
      key: 'smithing',
      previousLevel: 1,
      newLevel: 1,
      previousXp: 0,
      newXp: 10,
      xpGained: 10,
      nextLevelXp: 100,
    },
  };
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

  it("n'a pas de champ characterId — le client ne peut pas le fournir", () => {
    const dto = new CraftRequestDto();
    expect(Object.prototype.hasOwnProperty.call(dto, 'characterId')).toBe(false);
    const keys = Object.getOwnPropertyNames(CraftRequestDto.prototype);
    expect(keys).not.toContain('characterId');
  });
});

// ─── CraftingController ───────────────────────────────────────────────────────

describe('CraftingController', () => {
  let controller: CraftingController;
  let craftingService: Record<string, jest.Mock>;
  let characterService: Record<string, jest.Mock>;

  beforeEach(async () => {
    craftingService = {
      craft: jest.fn(),
    };

    characterService = {
      findFirstByUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CraftingController],
      providers: [
        { provide: CraftingService, useValue: craftingService },
        { provide: CharacterService, useValue: characterService },
      ],
    }).compile();

    controller = module.get<CraftingController>(CraftingController);
  });

  it('résout le characterId depuis req.user.userId et appelle craft()', async () => {
    const character = makeCharacter();
    const craftResult = makeCraftResult();
    characterService.findFirstByUser.mockResolvedValue(character);
    craftingService.craft.mockResolvedValue(craftResult);

    const req = { user: { userId: 'user-uuid-1' } };
    const dto: CraftRequestDto = {
      recipeId: 'recipe-uuid-1',
      quantity: 1,
    };

    const result = await controller.craft(req, dto);

    expect(characterService.findFirstByUser).toHaveBeenCalledWith('user-uuid-1');
    expect(craftingService.craft).toHaveBeenCalledWith('char-uuid-1', 'recipe-uuid-1', 1);
    expect(result).toEqual(craftResult);
  });

  it("n'utilise jamais un characterId venant du payload (pattern sécurisé)", async () => {
    const character = makeCharacter('server-resolved-id');
    characterService.findFirstByUser.mockResolvedValue(character);
    craftingService.craft.mockResolvedValue(makeCraftResult());

    const req = { user: { userId: 'user-uuid-1' } };
    // Le DTO ne contient pas characterId — whitelist + forbidNonWhitelisted bloquent tout champ inconnu
    const dto: CraftRequestDto = { recipeId: 'recipe-uuid-1', quantity: 1 };

    await controller.craft(req, dto);

    // Le characterId passé à craft est celui résolu par le serveur
    expect(craftingService.craft).toHaveBeenCalledWith('server-resolved-id', expect.any(String), expect.any(Number));
  });

  it("propage NotFoundException si le personnage n'existe pas", async () => {
    characterService.findFirstByUser.mockRejectedValue(
      new NotFoundException('No character found'),
    );

    const req = { user: { userId: 'user-uuid-1' } };
    const dto: CraftRequestDto = { recipeId: 'recipe-uuid-1', quantity: 1 };

    await expect(controller.craft(req, dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('retourne le CraftResult complet (attempts, successes, skill delta)', async () => {
    const craftResult = makeCraftResult();
    characterService.findFirstByUser.mockResolvedValue(makeCharacter());
    craftingService.craft.mockResolvedValue(craftResult);

    const result = await controller.craft(
      { user: { userId: 'user-uuid-1' } },
      { recipeId: 'recipe-uuid-1', quantity: 1 },
    );

    expect(result.attempts).toBe(1);
    expect(result.successes).toBe(1);
    expect(result.skill.xpGained).toBe(10);
    expect(result.consumed).toEqual([{ itemId: 'item-iron_ore', quantity: 3 }]);
    expect(result.produced).toEqual([{ itemId: 'item-iron_bar', quantity: 1 }]);
  });
});
