import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { CraftingService, CraftResult } from './crafting.service';
import { CraftRequestDto } from './dto/craft-request.dto';
import { CraftingRecipe } from './entities/crafting-recipe.entity';

export type AvailableCraftingRecipe = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  requiredSkillKey: string;
  requiredSkillLevel: number;
  baseSuccessRate: number;
  successBonusPerLevel: number;
  minSuccessRate: number;
  maxSuccessRate: number;
  xpReward: number;
  craftTimeMs: number;
  stationType: string;
  ingredients: {
    id: string;
    itemId: string;
    itemName: string;
    itemCategory: string;
    requiredQuantity: number;
  }[];
  results: {
    id: string;
    itemId: string;
    itemName: string;
    itemCategory: string;
    producedQuantity: number;
    chance: number;
  }[];
};

@Controller('crafting')
@UseGuards(JwtAuthGuard)
export class CraftingController {
  constructor(
    private readonly craftingService: CraftingService,
    private readonly characterService: CharacterService,
    @InjectRepository(CraftingRecipe)
    private readonly recipeRepo: Repository<CraftingRecipe>,
  ) {}

  /**
   * GET /crafting/available-recipes?stationType=forge
   *
   * Endpoint lecture UI : expose les recettes enabled et leurs ingrédients/résultats.
   * Ce endpoint n'autorise rien définitivement ; CraftingService.craft() reste la
   * validation serveur pour stationType, distance, inventaire, skill et résultat.
   */
  @Get('available-recipes')
  async getAvailableRecipes(
    @Query('stationType') stationType?: string,
  ): Promise<AvailableCraftingRecipe[]> {
    const where: Partial<CraftingRecipe> = { enabled: true };
    if (stationType) where.stationType = stationType;

    const recipes = await this.recipeRepo.find({
      where,
      relations: ['ingredients', 'ingredients.item', 'results', 'results.item'],
      order: { category: 'ASC', name: 'ASC' },
    });

    return recipes.map((recipe) => ({
      id: recipe.id,
      key: recipe.key,
      name: recipe.name,
      description: recipe.description ?? null,
      category: recipe.category,
      requiredSkillKey: recipe.requiredSkillKey,
      requiredSkillLevel: recipe.requiredSkillLevel,
      baseSuccessRate: recipe.baseSuccessRate,
      successBonusPerLevel: recipe.successBonusPerLevel,
      minSuccessRate: recipe.minSuccessRate,
      maxSuccessRate: recipe.maxSuccessRate,
      xpReward: recipe.xpReward,
      craftTimeMs: recipe.craftTimeMs,
      stationType: recipe.stationType,
      ingredients: (recipe.ingredients ?? []).map((ingredient) => ({
        id: ingredient.id,
        itemId: ingredient.itemId,
        itemName: ingredient.item?.name ?? ingredient.itemId,
        itemCategory: ingredient.item?.category ?? '',
        requiredQuantity: ingredient.requiredQuantity,
      })),
      results: (recipe.results ?? []).map((result) => ({
        id: result.id,
        itemId: result.itemId,
        itemName: result.item?.name ?? result.itemId,
        itemCategory: result.item?.category ?? '',
        producedQuantity: result.producedQuantity,
        chance: result.chance,
      })),
    }));
  }

  /**
   * POST /crafting/craft
   *
   * Déclenche une ou plusieurs tentatives de craft pour le personnage principal
   * de l'utilisateur authentifié.
   *
   * - characterId résolu côté serveur depuis le JWT (jamais accepté du client)
   * - whitelist + forbidNonWhitelisted rejette tout champ inconnu du DTO
   * - quantity bornée à [1, 99] par le DTO
   */
  @Get('stations/world-objects')
  getStationWorldObjects(@Query('mapId') mapId?: string) {
    return this.craftingService.getCraftingStationWorldObjects(
      mapId != null ? Number(mapId) : undefined,
    );
  }

  @Post('craft')
  async craft(@Request() req, @Body() dto: CraftRequestDto): Promise<CraftResult> {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.craftingService.craft(character.id, dto.recipeId, dto.quantity);
  }
}
