import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { CraftingService } from './crafting.service';
import { CraftJobService, CraftJobClaimResult } from './craft-job.service';
import { CraftRequestDto } from './dto/craft-request.dto';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { Item } from '../items/entities/item.entity';

/**
 * Résultat de l'action joueur « Fabriquer ». Toute fabrication joueur crée un
 * **CraftJob** (`mode: "job"`) — l'output n'est matérialisé qu'au claim. Le
 * champ `mode` reste discriminant pour préserver le contrat client si une règle
 * future introduit un autre mode côté serveur.
 */
export type CraftExecuteResult = { mode: 'job'; job: CraftJobDto };

export type CraftJobDto = {
  jobId: string;
  recipeId: string;
  recipeName: string;
  stationType: string;
  quantity: number;
  state: string;
  startedAt: Date;
  finishAt: Date;
  completedAt: Date | null;
  claimedAt: Date | null;
  successes: number;
  failures: number;
  outputs: {
    itemId: string;
    itemName: string;
    itemImage: string | null;
    quantity: number;
    resolvedQuantity: number;
  }[];
};

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
  craftCharacterXpReward: number;
  craftingDifficulty: number;
  stationType: string;
  ingredients: {
    id: string;
    itemId: string;
    itemName: string;
    itemCategory: string;
    itemImage: string | null;
    requiredQuantity: number;
  }[];
  results: {
    id: string;
    itemId: string;
    itemName: string;
    itemCategory: string;
    itemImage: string | null;
    producedQuantity: number;
    chance: number;
  }[];
};

@Controller('crafting')
@UseGuards(JwtAuthGuard)
export class CraftingController {
  constructor(
    private readonly craftingService: CraftingService,
    private readonly craftJobService: CraftJobService,
    private readonly characterService: CharacterService,
    @InjectRepository(CraftingRecipe)
    private readonly recipeRepo: Repository<CraftingRecipe>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  /**
   * GET /crafting/available-recipes?stationType=forge
   *
   * Endpoint lecture UI : expose les recettes enabled et leurs ingrédients/résultats.
   * Ce endpoint n'autorise rien définitivement ; le lancement d'un CraftJob
   * (`CraftJobService.launch`) reste la validation serveur pour stationType,
   * distance, inventaire, skill et résultat.
   */
  @Get('available-recipes')
  async getAvailableRecipes(
    @Query('stationType') stationType?: string,
  ): Promise<AvailableCraftingRecipe[]> {
    // Règle métier stricte : une station n'expose que ses propres recettes
    // (stationType exact). stationType 'none' reste réservé à un usage futur
    // (recette libre) et n'est pas ajouté implicitement aux stations.
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
      craftCharacterXpReward: recipe.craftCharacterXpReward,
      craftingDifficulty: recipe.craftingDifficulty,
      stationType: recipe.stationType,
      ingredients: (recipe.ingredients ?? []).map((ingredient) => ({
        id: ingredient.id,
        itemId: ingredient.itemId,
        itemName: ingredient.item?.name ?? ingredient.itemId,
        itemCategory: ingredient.item?.category ?? '',
        itemImage: ingredient.item?.image ?? null,
        requiredQuantity: ingredient.requiredQuantity,
      })),
      results: (recipe.results ?? []).map((result) => ({
        id: result.id,
        itemId: result.itemId,
        itemName: result.item?.name ?? result.itemId,
        itemCategory: result.item?.category ?? '',
        itemImage: result.item?.image ?? null,
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

  /**
   * Action joueur UNIQUE « Fabriquer ». Le serveur est AUTORITAIRE et décide du
   * workflow — le client ne choisit jamais la technologie.
   *
   * Règle actuelle (ADR-0009) : toute recette a une durée ≥ 3 s, donc toute
   * fabrication joueur crée un **CraftJob** (`mode: "job"`) et l'output n'est
   * matérialisé qu'au claim. Aucun craft instantané joueur n'existe. Le résultat
   * reste typé (`mode`) : si une règle future produit un craft immédiat (premium,
   * NPC…), le frontend n'a pas à changer.
   */
  @Post('craft')
  async craft(@Request() req, @Body() dto: CraftRequestDto): Promise<CraftExecuteResult> {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    const job = await this.craftJobService.launch(character.id, dto.recipeId, dto.quantity);
    const [jobDto] = await this.toCraftJobDtos([job]);
    return { mode: 'job', job: jobDto };
  }

  // ── CraftJob (production différée) ────────────────────────────────────────
  // characterId toujours résolu côté serveur depuis le JWT. Le lancement passe
  // exclusivement par POST /crafting/craft (routeur autoritaire ci-dessus) — il
  // n'existe plus d'endpoint de lancement séparé côté joueur.

  /** Liste les CraftJob du joueur (snapshot, jamais reconstruit depuis la recette). */
  @Get('jobs')
  async listJobs(@Request() req): Promise<CraftJobDto[]> {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    const jobs = await this.craftJobService.listForCharacter(character.id);
    return this.toCraftJobDtos(jobs);
  }

  /** Réclame la production terminée. */
  @Post('jobs/:jobId/claim')
  async claimJob(@Request() req, @Param('jobId') jobId: string): Promise<CraftJobClaimResult> {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.craftJobService.claim(character.id, jobId);
  }

  /**
   * Projette des CraftJob en DTO — **entièrement depuis le snapshot du job**,
   * jamais depuis la recette vivante (qui peut être renommée, désactivée ou
   * supprimée).
   *
   * - `recipeName` : snapshoté au lancement (`job.recipeName`).
   * - `outputs` (itemId, producedQuantity, resolvedQuantity) : snapshot du job.
   * - `itemName` / `itemImage` : résolus via le CATALOGUE `Item` par le `itemId`
   *   du snapshot (jointure autorisée), jamais via les outputs de la recette.
   */
  private async toCraftJobDtos(
    jobs: import('./entities/craft-job.entity').CraftJob[],
  ): Promise<CraftJobDto[]> {
    const outputItemIds = [
      ...new Set(jobs.flatMap((j) => (j.outputs ?? []).map((o) => o.itemId))),
    ];
    const items = outputItemIds.length
      ? await this.itemRepo.find({ where: { id: In(outputItemIds) }, select: ['id', 'name', 'image'] })
      : [];
    const itemById = new Map(items.map((it) => [it.id, it]));

    return jobs.map((job) => ({
      jobId: job.id,
      recipeId: job.recipeId,
      recipeName: job.recipeName || job.recipeId,
      stationType: job.stationType,
      quantity: job.quantity,
      state: job.state,
      startedAt: job.startedAt,
      finishAt: job.finishAt,
      completedAt: job.completedAt,
      claimedAt: job.claimedAt,
      successes: job.successes,
      failures: job.failures,
      outputs: (job.outputs ?? []).map((o) => {
        const item = itemById.get(o.itemId);
        return {
          itemId: o.itemId,
          itemName: item?.name ?? o.itemId,
          itemImage: item?.image ?? null,
          quantity: o.producedQuantity,
          resolvedQuantity: o.resolvedQuantity,
        };
      }),
    }));
  }
}
