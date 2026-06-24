import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingIngredient } from './entities/crafting-ingredient.entity';
import { CraftingResult } from './entities/crafting-result.entity';

// ─── Seed definitions ─────────────────────────────────────────────────────────
// Les itemCategory réfèrent à Item.category (cherché par (category, 'material')
// ou (category, 'weapon') selon le type de l'item attendu).

interface IngredientDef {
  itemCategory: string;
  itemType: string;
  quantity: number;
}

interface ResultDef {
  itemCategory: string;
  itemType: string;
  quantity: number;
  chance: number;
}

interface RecipeDef {
  key: string;
  name: string;
  description?: string;
  category: string;
  requiredSkillKey: string;
  requiredSkillLevel: number;
  baseSuccessRate: number;
  successBonusPerLevel: number;
  minSuccessRate: number;
  maxSuccessRate: number;
  xpReward: number;
  consumeIngredientsOnFailure: boolean;
  craftTimeMs: number;
  stationType: string;
  ingredients: IngredientDef[];
  results: ResultDef[];
}

/**
 * Recettes de référence Phase 1.
 * Chaîne : dead_tree → wooden_stick → basic_handle
 *          ore → iron_ore → iron_bar → rough_blade
 *          rough_blade + basic_handle → basic_sword
 */
export const DEFAULT_RECIPES: RecipeDef[] = [
  {
    key: 'iron_bar_from_ore',
    name: 'Fondre du minerai de fer',
    description: 'Fait fondre 3 minerais de fer pour obtenir un lingot.',
    category: 'smithing',
    requiredSkillKey: 'smithing',
    requiredSkillLevel: 1,
    baseSuccessRate: 1.0,
    successBonusPerLevel: 0.0,
    minSuccessRate: 1.0,
    maxSuccessRate: 1.0,
    xpReward: 10,
    consumeIngredientsOnFailure: true,
    craftTimeMs: 2000,
    stationType: 'none',
    ingredients: [{ itemCategory: 'iron_ore', itemType: 'material', quantity: 3 }],
    results: [{ itemCategory: 'iron_bar', itemType: 'material', quantity: 1, chance: 1.0 }],
  },
  {
    key: 'basic_handle_from_sticks',
    name: 'Façonner un manche brut',
    description: 'Assemble 3 bâtons de bois en un manche brut.',
    category: 'woodworking',
    requiredSkillKey: 'woodworking',
    requiredSkillLevel: 1,
    baseSuccessRate: 1.0,
    successBonusPerLevel: 0.0,
    minSuccessRate: 1.0,
    maxSuccessRate: 1.0,
    xpReward: 5,
    consumeIngredientsOnFailure: true,
    craftTimeMs: 1000,
    stationType: 'none',
    ingredients: [{ itemCategory: 'wooden_stick', itemType: 'material', quantity: 3 }],
    results: [{ itemCategory: 'basic_handle', itemType: 'material', quantity: 1, chance: 1.0 }],
  },
  {
    key: 'rough_blade_from_bars',
    name: 'Forger une lame brute',
    description: 'Forge 2 lingots de fer en une lame brute.',
    category: 'smithing',
    requiredSkillKey: 'smithing',
    requiredSkillLevel: 5,
    baseSuccessRate: 0.85,
    successBonusPerLevel: 0.02,
    minSuccessRate: 0.05,
    maxSuccessRate: 1.0,
    xpReward: 25,
    consumeIngredientsOnFailure: true,
    craftTimeMs: 3000,
    stationType: 'none',
    ingredients: [{ itemCategory: 'iron_bar', itemType: 'material', quantity: 2 }],
    results: [{ itemCategory: 'rough_blade', itemType: 'material', quantity: 1, chance: 1.0 }],
  },
  {
    key: 'basic_sword_assembly',
    name: 'Assembler une épée basique',
    description: 'Assemble une lame brute et un manche pour forger une épée.',
    category: 'smithing',
    requiredSkillKey: 'smithing',
    requiredSkillLevel: 10,
    baseSuccessRate: 0.75,
    successBonusPerLevel: 0.02,
    minSuccessRate: 0.05,
    maxSuccessRate: 1.0,
    xpReward: 50,
    consumeIngredientsOnFailure: true,
    craftTimeMs: 5000,
    stationType: 'none',
    ingredients: [
      { itemCategory: 'rough_blade', itemType: 'material', quantity: 1 },
      { itemCategory: 'basic_handle', itemType: 'material', quantity: 1 },
    ],
    results: [
      { itemCategory: 'basic_sword', itemType: 'weapon', quantity: 1, chance: 1.0 },
    ],
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CraftingService implements OnModuleInit {
  private readonly logger = new Logger(CraftingService.name);

  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(CraftingRecipe)
    private readonly recipeRepo: Repository<CraftingRecipe>,
    @InjectRepository(CraftingIngredient)
    private readonly ingredientRepo: Repository<CraftingIngredient>,
    @InjectRepository(CraftingResult)
    private readonly resultRepo: Repository<CraftingResult>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultRecipes();
  }

  /**
   * Seed non destructif — insère uniquement les recettes absentes.
   * Si un item référencé (ingrédient ou résultat) est absent en DB,
   * la recette est skippée avec un log warning pour ne pas crasher au boot.
   */
  async seedDefaultRecipes(): Promise<void> {
    for (const def of DEFAULT_RECIPES) {
      const existing = await this.recipeRepo.findOne({
        where: { key: def.key },
      });
      if (existing) continue;

      // Résoudre les items par (category, type)
      const ingredientItems = await this.resolveItems(def.ingredients);
      if (ingredientItems === null) {
        this.logger.warn(
          `[seed] Recette "${def.key}" skippée — ingrédient(s) manquant(s) en DB`,
        );
        continue;
      }

      const resultItems = await this.resolveItems(def.results);
      if (resultItems === null) {
        this.logger.warn(
          `[seed] Recette "${def.key}" skippée — résultat(s) manquant(s) en DB`,
        );
        continue;
      }

      // Créer la recette avec cascade sur ingredients + results
      const recipe = this.recipeRepo.create({
        key: def.key,
        name: def.name,
        description: def.description ?? null,
        category: def.category,
        requiredSkillKey: def.requiredSkillKey,
        requiredSkillLevel: def.requiredSkillLevel,
        baseSuccessRate: def.baseSuccessRate,
        successBonusPerLevel: def.successBonusPerLevel,
        minSuccessRate: def.minSuccessRate,
        maxSuccessRate: def.maxSuccessRate,
        xpReward: def.xpReward,
        consumeIngredientsOnFailure: def.consumeIngredientsOnFailure,
        craftTimeMs: def.craftTimeMs,
        stationType: def.stationType,
        enabled: true,
        isDefault: true,
      });

      const savedRecipe = await this.recipeRepo.save(recipe);

      // Ingrédients
      for (let i = 0; i < def.ingredients.length; i++) {
        const ing = this.ingredientRepo.create({
          recipeId: savedRecipe.id,
          itemId: ingredientItems[i].id,
          requiredQuantity: def.ingredients[i].quantity,
        });
        await this.ingredientRepo.save(ing);
      }

      // Résultats
      for (let i = 0; i < def.results.length; i++) {
        const res = this.resultRepo.create({
          recipeId: savedRecipe.id,
          itemId: resultItems[i].id,
          producedQuantity: def.results[i].quantity,
          chance: def.results[i].chance,
        });
        await this.resultRepo.save(res);
      }

      this.logger.log(`[seed] Recette seedée : ${def.key}`);
    }
  }

  /**
   * Résout une liste de définitions item → items DB.
   * Retourne null si au moins un item est introuvable.
   */
  private async resolveItems(
    defs: { itemCategory: string; itemType: string }[],
  ): Promise<Item[] | null> {
    const items: Item[] = [];
    for (const def of defs) {
      const item = await this.itemRepo.findOne({
        where: { category: def.itemCategory, type: def.itemType },
      });
      if (!item) return null;
      items.push(item);
    }
    return items;
  }
}
