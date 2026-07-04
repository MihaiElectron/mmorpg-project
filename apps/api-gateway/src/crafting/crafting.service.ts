import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Item, ObjectMode } from '../items/entities/item.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
  ItemInstanceType,
} from '../item-instances/entities/item-instance.entity';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { Character } from '../characters/entities/character.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { SkillDefinition } from '../skills/entities/skill-definition.entity';
import { PlayerSkill } from '../skills/entities/player-skill.entity';
import { SkillsService } from '../skills/skills.service';
import { WorldService } from '../world/world.service';
import { euclideanDistanceWU } from '../common/world-coordinates';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingIngredient } from './entities/crafting-ingredient.entity';
import { CraftingResult } from './entities/crafting-result.entity';
import { CraftingStationTemplate } from './entities/crafting-station-template.entity';
import { CraftingStation } from './entities/crafting-station.entity';
import {
  toCraftingStationWorldObject,
  CraftingStationWorldObject,
} from './adapters/crafting-station-world-object.adapter';
import { ItemMaterializationService } from '../item-materialization/item-materialization.service';
import { ItemInstanceSource } from '../item-instances/enums/item-instance-source.enum';
import type { LootEntry } from '../world/loot.service';
import {
  ProgressionService,
  ProgressionSource,
  CharacterXpResult,
} from '../progression/progression.service';
import { calculateSkillXp } from '../skill-xp-calculator/skill-xp-calculator';
import { SkillDomain, SkillXpContext } from '../skill-xp-calculator/skill-xp-context';

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

interface StationTemplateDef {
  key: string;
  name: string;
  stationType: string;
  category: string;
  requiredSkillKey?: string | null;
  interactionRadiusWU?: number;
}

type CraftingStationErrorCode =
  | 'CRAFTING_STATION_REQUIRED'
  | 'CRAFTING_STATION_OUT_OF_RANGE';

type CraftingStationErrorBody = {
  code: CraftingStationErrorCode;
  message: string;
  stationType: string;
  nearestDistanceWU?: number;
  requiredRadiusWU?: number;
};

export const DEFAULT_CRAFTING_STATION_TEMPLATES: StationTemplateDef[] = [
  { key: 'forge', name: 'Forge', stationType: 'forge', category: 'smithing', requiredSkillKey: 'smithing' },
  { key: 'workbench', name: 'Workbench', stationType: 'workbench', category: 'woodworking', requiredSkillKey: 'woodworking' },
  { key: 'sawmill', name: 'Sawmill', stationType: 'sawmill', category: 'woodworking', requiredSkillKey: 'woodworking' },
  { key: 'alchemy_table', name: 'Alchemy Table', stationType: 'alchemy_table', category: 'alchemy', requiredSkillKey: 'alchemy' },
  { key: 'cooking_station', name: 'Cooking Station', stationType: 'cooking_station', category: 'cooking', requiredSkillKey: 'cooking' },
];

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
    craftTimeMs: 3000,
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
    craftTimeMs: 3000,
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

// ─── CraftResult ──────────────────────────────────────────────────────────────

export interface CraftResult {
  recipeId: string;
  recipeKey: string;
  requestedQuantity: number;
  attempts: number;
  successes: number;
  failures: number;
  consumed: { itemId: string; quantity: number }[];
  produced: { itemId: string; quantity: number }[];
  // Skill XP calculée par le Runtime (ADR-0016). null si aucune XP accordée
  // (0 succès ou skill non résolu).
  skill: {
    key: string;
    previousLevel: number;
    newLevel: number;
    previousXp: number;
    newXp: number;
    xpGained: number;
    nextLevelXp: number;
  } | null;
  // Character XP portée par la recette (craftCharacterXpReward). null si 0.
  characterXp:
    | (CharacterXpResult & { xpGained: number })
    | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class CraftingService implements OnModuleInit {
  private readonly logger = new Logger(CraftingService.name);

  /**
   * Overridable pour les tests — ne jamais laisser le client influencer ce tirage.
   * Retourne un float dans [0, 1[.
   */
  protected _randomFn = (): number => Math.random();

  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(CraftingRecipe)
    private readonly recipeRepo: Repository<CraftingRecipe>,
    @InjectRepository(CraftingIngredient)
    private readonly ingredientRepo: Repository<CraftingIngredient>,
    @InjectRepository(CraftingResult)
    private readonly resultRepo: Repository<CraftingResult>,
    @InjectRepository(CraftingStationTemplate)
    private readonly stationTemplateRepo: Repository<CraftingStationTemplate>,
    @InjectRepository(CraftingStation)
    private readonly stationRepo: Repository<CraftingStation>,
    private readonly dataSource: DataSource,
    private readonly skillsService: SkillsService,
    private readonly worldService: WorldService,
    private readonly itemMaterialization: ItemMaterializationService,
    private readonly progressionService: ProgressionService,
    private readonly itemTransferService: ItemTransferService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultRecipes();
    await this.seedDefaultStationTemplates();
  }

  // ---------------------------------------------------------------------------
  // Seed
  // ---------------------------------------------------------------------------

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
   * Seed non destructif — insère uniquement les templates de station absents.
   */
  async seedDefaultStationTemplates(): Promise<void> {
    for (const def of DEFAULT_CRAFTING_STATION_TEMPLATES) {
      const existing = await this.stationTemplateRepo.findOne({ where: { key: def.key } });
      if (existing) continue;

      const template = this.stationTemplateRepo.create({
        key: def.key,
        name: def.name,
        stationType: def.stationType,
        category: def.category,
        requiredSkillKey: def.requiredSkillKey ?? null,
        interactionRadiusWU: def.interactionRadiusWU ?? 1536,
        enabled: true,
      });
      await this.stationTemplateRepo.save(template);
      this.logger.log(`[seed] Station template seedé : ${def.key}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Runtime craft — transactionnel
  // ---------------------------------------------------------------------------

  /**
   * Exécute `quantity` tentatives de craft pour `characterId` sur `recipeId`.
   *
   * Tout le flow s'exécute dans une transaction TypeORM :
   * - vérification recipe/skill/level
   * - lock pessimiste des lignes Inventory concernées
   * - tirage côté serveur uniquement
   * - consommation/production agrégées
   * - XP accordée pour chaque tentative (succès ou échec)
   *
   * Rollback automatique si une exception est levée à n'importe quelle étape.
   */
  async craft(
    characterId: string,
    recipeId: string,
    quantity: number,
  ): Promise<CraftResult> {
    if (quantity < 1) throw new BadRequestException('quantity doit être >= 1');

    return this.dataSource.transaction(async (manager) => {
      // ── 1. Character ─────────────────────────────────────────────────────
      const character = await manager.findOne(Character, {
        where: { id: characterId },
      });
      if (!character) {
        throw new NotFoundException(`Personnage ${characterId} introuvable`);
      }

      // ── 2. Recipe ─────────────────────────────────────────────────────────
      const recipe = await manager.findOne(CraftingRecipe, {
        where: { id: recipeId },
        relations: ['ingredients', 'results'],
      });
      if (!recipe) throw new NotFoundException(`Recette ${recipeId} introuvable`);
      if (!recipe.enabled) {
        throw new BadRequestException(`Recette "${recipe.key}" désactivée`);
      }

      if (recipe.stationType !== 'none') {
        await this.findNearestCompatibleStationOrThrow(characterId, recipe, manager);
      }

      // ── 3. SkillDefinition ────────────────────────────────────────────────
      const skillDef = await manager.findOne(SkillDefinition, {
        where: { key: recipe.requiredSkillKey },
      });
      if (!skillDef) {
        throw new NotFoundException(`Skill "${recipe.requiredSkillKey}" introuvable`);
      }
      if (!skillDef.enabled) {
        throw new BadRequestException(`Skill "${skillDef.key}" désactivé`);
      }

      // ── 4. PlayerSkill ────────────────────────────────────────────────────
      const playerSkill = await this.skillsService.getOrCreatePlayerSkillInTx(
        characterId,
        skillDef,
        manager,
      );
      if (playerSkill.level < recipe.requiredSkillLevel) {
        throw new BadRequestException(
          `Niveau ${recipe.requiredSkillLevel} requis en ${skillDef.key}, niveau actuel : ${playerSkill.level}`,
        );
      }

      // ── 5. Taux de succès ─────────────────────────────────────────────────
      // clamp(base + (playerLevel - required) × bonus, min, max)
      const successRate = Math.min(
        recipe.maxSuccessRate,
        Math.max(
          recipe.minSuccessRate,
          recipe.baseSuccessRate +
            (playerSkill.level - recipe.requiredSkillLevel) *
              recipe.successBonusPerLevel,
        ),
      );

      // ── 6. Lock inventaire + validation quantités ─────────────────────────
      // Les ingrédients peuvent être STACKABLE (stock Inventory) ou INSTANCE
      // (une ItemInstance NORMAL/AVAILABLE/INVENTORY par unité). On résout
      // objectMode via Item, puis on valide chaque type sur sa source réelle.
      const ingredientItemIds = recipe.ingredients.map((i) => i.itemId);
      const ingredientItems =
        ingredientItemIds.length > 0
          ? await manager.find(Item, { where: { id: In(ingredientItemIds) } })
          : [];
      const objectModeByItemId = new Map<string, ObjectMode>();
      for (const it of ingredientItems) objectModeByItemId.set(it.id, it.objectMode);
      const isInstanceIngredient = (itemId: string): boolean =>
        objectModeByItemId.get(itemId) === ObjectMode.INSTANCE;

      const stackableIds = ingredientItemIds.filter((id) => !isInstanceIngredient(id));
      const instanceIds = ingredientItemIds.filter((id) => isInstanceIngredient(id));

      // STACKABLE — lignes Inventory verrouillées.
      const inventoryRows =
        stackableIds.length > 0
          ? await manager.find(Inventory, {
              where: {
                character: { id: characterId },
                item: { id: In(stackableIds) },
              },
              relations: ['item'],
              lock: { mode: 'pessimistic_write' },
            })
          : [];
      const invMap = new Map<string, Inventory>();
      for (const row of inventoryRows) {
        invMap.set(row.item.id, row);
      }

      // INSTANCE — instances NORMAL/AVAILABLE/INVENTORY du personnage, verrouillées.
      const lockedInstancesByItemId = new Map<string, ItemInstance[]>();
      for (const itemId of instanceIds) {
        const instances = await manager
          .getRepository(ItemInstance)
          .createQueryBuilder('i')
          .setLock('pessimistic_write')
          .where(
            'i.itemId = :itemId AND i.ownerId = :ownerId AND i.containerType = :containerType AND i.state = :state AND i.instanceType = :instanceType',
            {
              itemId,
              ownerId: characterId,
              containerType: ItemInstanceContainerType.INVENTORY,
              state: ItemInstanceState.AVAILABLE,
              instanceType: ItemInstanceType.NORMAL,
            },
          )
          .orderBy('i.createdAt', 'ASC')
          .getMany();
        lockedInstancesByItemId.set(itemId, instances);
      }

      for (const ing of recipe.ingredients) {
        const needed = ing.requiredQuantity * quantity;
        const available = isInstanceIngredient(ing.itemId)
          ? (lockedInstancesByItemId.get(ing.itemId)?.length ?? 0)
          : (invMap.get(ing.itemId)?.quantity ?? 0);
        if (available < needed) {
          throw new BadRequestException(
            `Inventaire insuffisant : ${available} disponibles, ${needed} requis`,
          );
        }
      }

      // ── 7. Tentatives ─────────────────────────────────────────────────────
      const consumedMap = new Map<string, number>();
      const producedMap = new Map<string, number>();
      let successes = 0;
      let failures = 0;

      for (let i = 0; i < quantity; i++) {
        const isSuccess = this._randomFn() < successRate;
        const shouldConsume = isSuccess || recipe.consumeIngredientsOnFailure;

        if (shouldConsume) {
          for (const ing of recipe.ingredients) {
            consumedMap.set(
              ing.itemId,
              (consumedMap.get(ing.itemId) ?? 0) + ing.requiredQuantity,
            );
          }
        }

        if (isSuccess) {
          successes++;
          for (const res of recipe.results) {
            if (this._randomFn() < res.chance) {
              producedMap.set(
                res.itemId,
                (producedMap.get(res.itemId) ?? 0) + res.producedQuantity,
              );
            }
          }
        } else {
          failures++;
        }
      }

      // ── 8. Persister les consommations ────────────────────────────────────
      for (const [itemId, consumed] of consumedMap) {
        if (consumed <= 0) continue;
        if (isInstanceIngredient(itemId)) {
          // INSTANCE — consommer `consumed` instances verrouillées via la
          // transition CRAFT_CONSUME (AVAILABLE/INVENTORY/NORMAL → DESTROYED).
          const instances = lockedInstancesByItemId.get(itemId) ?? [];
          for (let k = 0; k < consumed; k++) {
            const inst = instances[k];
            await this.itemTransferService.transfer(manager, inst.id, {
              requesterId: characterId,
              transition: { type: 'CRAFT_CONSUME', characterId },
            });
          }
        } else {
          // STACKABLE — décrément de la ligne Inventory.
          const inv = invMap.get(itemId)!;
          inv.quantity -= consumed;
          if (inv.quantity <= 0) {
            await manager.remove(Inventory, inv);
          } else {
            await manager.save(Inventory, inv);
          }
        }
      }

      // ── 9. Matérialisation des résultats ─────────────────────────────────
      const lootEntries: LootEntry[] = [...producedMap.entries()]
        .filter(([, qty]) => qty > 0)
        .map(([itemId, quantity]) => ({ itemId, quantity }));
      if (lootEntries.length > 0) {
        await this.itemMaterialization.materialize(manager, lootEntries, {
          source: ItemInstanceSource.CRAFT,
          destination: { type: 'INVENTORY', characterId },
          ownerId: characterId,
        });
      }

      // ── 10. XP Runtime (ADR-0016) ─────────────────────────────────────────
      // Skill XP calculée par le Runtime depuis la difficulté de la recette
      // (jamais une valeur d'XP skill stockée). Character XP portée par la
      // recette. Les échecs n'accordent pas d'XP (calculateSkillXp: success).
      const previousLevel = playerSkill.level;
      const previousXp = playerSkill.xp;

      let skillPayload: CraftResult['skill'] = null;
      const skillXpResult =
        successes > 0
          ? calculateSkillXp(
              this.buildCraftSkillXpContext(recipe, character, playerSkill.level),
            )
          : null;
      if (skillXpResult) {
        const skillXpTotal = skillXpResult.xpAmount * successes;
        const updatedSkill = await this.skillsService.applySkillXpInTx(
          characterId,
          skillXpResult.skillDefinitionKey,
          skillXpTotal,
          manager,
        );
        skillPayload = {
          key: updatedSkill.key,
          previousLevel,
          newLevel: updatedSkill.level,
          previousXp,
          newXp: updatedSkill.xp,
          xpGained: skillXpTotal,
          nextLevelXp: updatedSkill.nextLevelXp,
        };
      }

      let characterXp: CraftResult['characterXp'] = null;
      const charXpTotal = Math.max(0, recipe.craftCharacterXpReward ?? 0) * successes;
      if (charXpTotal > 0) {
        const cx = await this.progressionService.applyCharacterXpInTx(
          characterId,
          charXpTotal,
          ProgressionSource.CRAFT,
          manager,
        );
        characterXp = { ...cx, xpGained: charXpTotal };
      }

      // ── 11. Résultat ──────────────────────────────────────────────────────
      return {
        recipeId: recipe.id,
        recipeKey: recipe.key,
        requestedQuantity: quantity,
        attempts: quantity,
        successes,
        failures,
        consumed: [...consumedMap.entries()].map(([itemId, qty]) => ({
          itemId,
          quantity: qty,
        })),
        produced: [...producedMap.entries()].map(([itemId, qty]) => ({
          itemId,
          quantity: qty,
        })),
        skill: skillPayload,
        characterXp,
      };
    });
  }

  /**
   * Construit le SkillXpContext craft (ADR-0016). Le skill est résolu depuis
   * requiredSkillKey existant — aucun champ craftSkillKey/craftSkillXpReward.
   */
  private buildCraftSkillXpContext(
    recipe: CraftingRecipe,
    character: Character,
    skillLevel: number,
  ): SkillXpContext {
    return {
      skillDefinitionKey: recipe.requiredSkillKey,
      domain: 'crafting' as SkillDomain,
      action: 'craft',
      success: true,
      difficulty: Math.max(0, Math.min(100, recipe.craftingDifficulty ?? 0)),
      quality: null,
      characterLevel: character.level ?? 1,
      skillLevel,
      duration: recipe.craftTimeMs > 0 ? recipe.craftTimeMs : null,
      damage: null,
      blockedDamage: null,
      healedAmount: null,
      buffs: [],
      debuffs: [],
    };
  }

  // ---------------------------------------------------------------------------
  // Interne
  // ---------------------------------------------------------------------------

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

  /**
   * Validation runtime station de craft.
   *
   * Distance : euclidienne en WU. Le client ne fournit jamais stationId en Phase 1 ;
   * le serveur choisit implicitement la station compatible la plus proche.
   */
  // Public : réutilisé par CraftJobService pour valider la station au lancement
  // d'une production différée (évite la duplication de la logique anti-cheat).
  async findNearestCompatibleStationOrThrow(
    characterId: string,
    recipe: CraftingRecipe,
    manager: EntityManager,
  ): Promise<CraftingStation> {
    const player = this.worldService.getConnectedPlayerByCharacterId(characterId);
    if (!player) {
      throw this.craftingStationException({
        code: 'CRAFTING_STATION_REQUIRED',
        message: `${this.stationTypeLabel(recipe.stationType)} requise : personnage non connecté au monde.`,
        stationType: recipe.stationType,
      });
    }

    const stations = await manager.find(CraftingStation, {
      where: { enabled: true, mapId: player.mapId },
      relations: ['template'],
    });

    let nearest: { station: CraftingStation; distance: number } | null = null;
    let nearestCompatible: { station: CraftingStation; distance: number; radius: number } | null = null;
    for (const station of stations) {
      if (!station.enabled) continue;
      if (station.mapId !== player.mapId) continue;
      const template = station.template;
      if (!template?.enabled) continue;
      if (template.stationType !== recipe.stationType) continue;
      if (template.interactionRadiusWU <= 0) continue;

      const distance = euclideanDistanceWU(player, station);
      if (!nearestCompatible || distance < nearestCompatible.distance) {
        nearestCompatible = {
          station,
          distance,
          radius: template.interactionRadiusWU,
        };
      }
      if (distance <= template.interactionRadiusWU) {
        if (!nearest || distance < nearest.distance) nearest = { station, distance };
      }
    }

    if (!nearest) {
      if (nearestCompatible) {
        throw this.craftingStationException({
          code: 'CRAFTING_STATION_OUT_OF_RANGE',
          message: `${this.stationTypeLabel(recipe.stationType)} trop éloignée.`,
          stationType: recipe.stationType,
          nearestDistanceWU: Math.round(nearestCompatible.distance),
          requiredRadiusWU: Math.round(nearestCompatible.radius),
        });
      }

      throw this.craftingStationException({
        code: 'CRAFTING_STATION_REQUIRED',
        message: `${this.stationTypeLabel(recipe.stationType)} requise : aucune station compatible active à portée.`,
        stationType: recipe.stationType,
      });
    }

    return nearest.station;
  }

  async getCraftingStationWorldObjects(mapId?: number): Promise<CraftingStationWorldObject[]> {
    const where = mapId != null ? { mapId } : undefined;
    const stations = await this.stationRepo.find({
      where,
      relations: ['template'],
      order: { mapId: 'ASC', worldX: 'ASC', worldY: 'ASC' },
    });
    return stations.map(toCraftingStationWorldObject);
  }

  private craftingStationException(body: CraftingStationErrorBody): BadRequestException {
    return new BadRequestException(body);
  }

  private stationTypeLabel(stationType: string): string {
    const label = stationType.replace(/_/g, ' ');
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
}
