import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, LessThanOrEqual } from 'typeorm';
import { Character } from '../characters/entities/character.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { SkillDefinition } from '../skills/entities/skill-definition.entity';
import { SkillsService } from '../skills/skills.service';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
  ItemInstanceType,
} from '../item-instances/entities/item-instance.entity';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { ItemMaterializationService } from '../item-materialization/item-materialization.service';
import { ItemInstanceSource } from '../item-instances/enums/item-instance-source.enum';
import type { LootEntry } from '../world/loot.service';
import {
  ProgressionService,
  ProgressionSource,
} from '../progression/progression.service';
import { calculateSkillXp } from '../skill-xp-calculator/skill-xp-calculator';
import { SkillDomain, SkillXpContext } from '../skill-xp-calculator/skill-xp-context';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingService } from './crafting.service';
import { CraftJob, CraftJobState } from './entities/craft-job.entity';
import { CraftJobIngredient } from './entities/craft-job-ingredient.entity';
import { CraftJobOutput } from './entities/craft-job-output.entity';

// Versions courantes figées dans chaque job au lancement (ADR-0009).
export const CRAFT_JOB_VERSION = 1;
export const CRAFT_SERVER_FORMULA_VERSION = 1;

/** Résultat d'une tentative de complétion (null = skip idempotent). */
export interface CraftJobCompletionResult {
  jobId: string;
  state: CraftJobState.COMPLETED | CraftJobState.FAILED;
  successes: number;
  failures: number;
}

/** Résultat d'un claim réussi. */
export interface CraftJobClaimResult {
  jobId: string;
  state: CraftJobState.CLAIMED;
  produced: { itemId: string; quantity: number }[];
}

/**
 * CraftJobService — production différée persistante (ADR-0009, V1).
 *
 * V1 = FONDATION UNIQUEMENT :
 * - `launch()` crée un CraftJob RUNNING avec snapshot complet et réserve les
 *   ingrédients (escrow).
 * - AUCUNE matérialisation d'item, AUCUN scheduler, AUCUN claim, AUCUN offline.
 *   Un job ne se termine jamais automatiquement dans cette phase.
 *
 * Invariants respectés : `ItemMaterializationService` seul créateur (non appelé
 * ici), `ItemTransferService` seul mutateur d'ItemInstance (réservation via
 * `RESERVE_FOR_CRAFT`), validation station réutilisée de `CraftingService`.
 */
@Injectable()
export class CraftJobService {
  private readonly logger = new Logger(CraftJobService.name);

  /** Overridable pour les tests — jamais influencé par le client. [0,1[. */
  protected _randomFn = (): number => Math.random();

  constructor(
    private readonly dataSource: DataSource,
    private readonly skillsService: SkillsService,
    private readonly itemTransferService: ItemTransferService,
    private readonly craftingService: CraftingService,
    private readonly progressionService: ProgressionService,
    private readonly itemMaterialization: ItemMaterializationService,
  ) {}

  /**
   * Lance une production différée : valide recette/station/skill/ingrédients,
   * fige le snapshot, réserve les ingrédients et persiste le job RUNNING —
   * le tout dans une transaction unique (rollback total si une étape échoue).
   */
  async launch(
    characterId: string,
    recipeId: string,
    quantity: number,
  ): Promise<CraftJob> {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('quantity doit être un entier >= 1');
    }

    return this.dataSource.transaction(async (manager) => {
      // ── 1. Personnage ──────────────────────────────────────────────────────
      const character = await manager.findOne(Character, { where: { id: characterId } });
      if (!character) {
        throw new NotFoundException(`Personnage ${characterId} introuvable`);
      }

      // ── 2. Recette ─────────────────────────────────────────────────────────
      const recipe = await manager.findOne(CraftingRecipe, {
        where: { id: recipeId },
        relations: ['ingredients', 'results'],
      });
      if (!recipe) throw new NotFoundException(`Recette ${recipeId} introuvable`);
      if (!recipe.enabled) {
        throw new BadRequestException(`Recette "${recipe.key}" désactivée`);
      }

      // ── 3. Station (réutilise la validation anti-cheat de CraftingService) ──
      let stationId: string | null = null;
      if (recipe.stationType !== 'none') {
        const station = await this.craftingService.findNearestCompatibleStationOrThrow(
          characterId,
          recipe,
          manager,
        );
        stationId = station.id;
      }

      // ── 4. Skill requis ────────────────────────────────────────────────────
      const skillDef = await manager.findOne(SkillDefinition, {
        where: { key: recipe.requiredSkillKey },
      });
      if (!skillDef) {
        throw new NotFoundException(`Skill "${recipe.requiredSkillKey}" introuvable`);
      }
      if (!skillDef.enabled) {
        throw new BadRequestException(`Skill "${skillDef.key}" désactivé`);
      }
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

      // ── 5. Disponibilité des ingrédients (STACKABLE / INSTANCE) ─────────────
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
      for (const row of inventoryRows) invMap.set(row.item.id, row);

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

      // ── 6. Création du job (snapshot immuable) ─────────────────────────────
      const startedAt = new Date();
      const finishAt = new Date(startedAt.getTime() + recipe.craftTimeMs * quantity);
      const savedJob = await manager.save(
        CraftJob,
        manager.create(CraftJob, {
          characterId,
          state: CraftJobState.RUNNING,
          recipeId: recipe.id,
          recipeVersion: recipe.version ?? 1,
          jobVersion: CRAFT_JOB_VERSION,
          serverFormulaVersion: CRAFT_SERVER_FORMULA_VERSION,
          stationId,
          stationType: recipe.stationType,
          quantity,
          craftTimeMs: recipe.craftTimeMs,
          craftingDifficulty: recipe.craftingDifficulty ?? 0,
          requiredSkillKey: recipe.requiredSkillKey,
          requiredSkillLevel: recipe.requiredSkillLevel,
          craftCharacterXpReward: recipe.craftCharacterXpReward ?? 0,
          consumeIngredientsOnFailure: recipe.consumeIngredientsOnFailure,
          baseSuccessRate: recipe.baseSuccessRate,
          successBonusPerLevel: recipe.successBonusPerLevel,
          minSuccessRate: recipe.minSuccessRate,
          maxSuccessRate: recipe.maxSuccessRate,
          startedAt,
          finishAt,
        }),
      );

      // ── 7. Réservation des ingrédients (escrow) ────────────────────────────
      for (const ing of recipe.ingredients) {
        const needed = ing.requiredQuantity * quantity;
        if (isInstanceIngredient(ing.itemId)) {
          const instances = lockedInstancesByItemId.get(ing.itemId) ?? [];
          for (let k = 0; k < needed; k++) {
            await this.itemTransferService.transfer(manager, instances[k].id, {
              requesterId: characterId,
              transition: { type: 'RESERVE_FOR_CRAFT', characterId, jobId: savedJob.id },
            });
          }
        } else {
          const inv = invMap.get(ing.itemId)!;
          inv.quantity -= needed;
          if (inv.quantity <= 0) {
            await manager.remove(Inventory, inv);
          } else {
            await manager.save(Inventory, inv);
          }
        }
      }

      // ── 8. Snapshot ingrédients + outputs ──────────────────────────────────
      const jobIngredients = recipe.ingredients.map((ing) =>
        manager.create(CraftJobIngredient, {
          jobId: savedJob.id,
          itemId: ing.itemId,
          objectMode: objectModeByItemId.get(ing.itemId) ?? ObjectMode.STACKABLE,
          requiredQuantity: ing.requiredQuantity,
          reservedQuantity: ing.requiredQuantity * quantity,
        }),
      );
      await manager.save(CraftJobIngredient, jobIngredients);

      const resultItemIds = recipe.results.map((r) => r.itemId);
      const resultItems =
        resultItemIds.length > 0
          ? await manager.find(Item, { where: { id: In(resultItemIds) } })
          : [];
      const outputModeByItemId = new Map<string, ObjectMode>();
      for (const it of resultItems) outputModeByItemId.set(it.id, it.objectMode);

      const jobOutputs = recipe.results.map((res) =>
        manager.create(CraftJobOutput, {
          jobId: savedJob.id,
          itemId: res.itemId,
          objectMode: outputModeByItemId.get(res.itemId) ?? ObjectMode.STACKABLE,
          producedQuantity: res.producedQuantity,
          chance: res.chance,
        }),
      );
      await manager.save(CraftJobOutput, jobOutputs);

      savedJob.ingredients = jobIngredients;
      savedJob.outputs = jobOutputs;
      return savedJob;
    });
  }

  /**
   * Complétion d'un CraftJob dû : RUNNING → COMPLETED (≥1 succès) ou FAILED
   * (échec total). Transaction unique, verrou pessimiste, recheck RUNNING →
   * IDEMPOTENT. Retourne null si le job n'existe pas ou n'est plus RUNNING.
   *
   * INVARIANT ADR-0009 : ne crée, ne détruit ni ne déplace aucun Item OUTPUT.
   * `ItemMaterializationService` n'est PAS utilisé ici — l'output n'existe qu'au
   * claim (Phase 3). Seules opérations sur items : consommation définitive des
   * ingrédients INSTANCE réservés (IN_CRAFT_ORDER → DESTROYED). Le résultat de
   * production (succès/échec, quantités d'output) est figé dans le snapshot.
   */
  async complete(jobId: string): Promise<CraftJobCompletionResult | null> {
    return this.dataSource.transaction(async (manager) => {
      const job = await manager
        .getRepository(CraftJob)
        .createQueryBuilder('j')
        .setLock('pessimistic_write')
        .where('j.id = :id', { id: jobId })
        .getOne();
      if (!job) return null;
      if (job.state !== CraftJobState.RUNNING) return null; // idempotence

      const ingredients = await manager.find(CraftJobIngredient, { where: { jobId } });
      const outputs = await manager.find(CraftJobOutput, { where: { jobId } });

      // Niveau de skill courant (le skill appartient au joueur, jamais relu de la
      // recette vivante). Si le skill a disparu, on complète sans bonus ni XP.
      const skillDef = await manager.findOne(SkillDefinition, {
        where: { key: job.requiredSkillKey },
      });
      let skillLevel = job.requiredSkillLevel;
      if (skillDef && skillDef.enabled) {
        const playerSkill = await this.skillsService.getOrCreatePlayerSkillInTx(
          job.characterId,
          skillDef,
          manager,
        );
        skillLevel = playerSkill.level;
      }

      // Taux de succès depuis le SNAPSHOT uniquement (jamais la recette vivante).
      const successRate = Math.min(
        job.maxSuccessRate,
        Math.max(
          job.minSuccessRate,
          job.baseSuccessRate + (skillLevel - job.requiredSkillLevel) * job.successBonusPerLevel,
        ),
      );

      let successes = 0;
      let failures = 0;
      let consumedSets = 0;
      for (let i = 0; i < job.quantity; i++) {
        const isSuccess = this._randomFn() < successRate;
        if (isSuccess) successes++;
        else failures++;
        if (isSuccess || job.consumeIngredientsOnFailure) consumedSets++;
      }

      // Résolution des OUTPUTS (chance tirée par succès) — quantités seulement,
      // aucun item créé. La matérialisation aura lieu au claim (Phase 3).
      for (const out of outputs) {
        let resolved = 0;
        for (let s = 0; s < successes; s++) {
          if (this._randomFn() < out.chance) resolved += out.producedQuantity;
        }
        out.resolvedQuantity = resolved;
      }
      if (outputs.length > 0) await manager.save(CraftJobOutput, outputs);

      // Consommation définitive des ingrédients consommés.
      for (const ing of ingredients) {
        const consumedQty = consumedSets * ing.requiredQuantity;
        ing.consumedQuantity = consumedQty;
        if (consumedQty > 0 && ing.objectMode === ObjectMode.INSTANCE) {
          const reserved = await manager
            .getRepository(ItemInstance)
            .createQueryBuilder('i')
            .setLock('pessimistic_write')
            .where(
              'i.itemId = :itemId AND i.containerType = :containerType AND i.containerId = :jobId AND i.state = :state AND i.instanceType = :instanceType',
              {
                itemId: ing.itemId,
                containerType: ItemInstanceContainerType.CRAFT_ORDER,
                jobId,
                state: ItemInstanceState.IN_CRAFT_ORDER,
                instanceType: ItemInstanceType.NORMAL,
              },
            )
            .orderBy('i.createdAt', 'ASC')
            .getMany();
          for (let k = 0; k < consumedQty; k++) {
            await this.itemTransferService.transfer(manager, reserved[k].id, {
              requesterId: null,
              transition: { type: 'CONSUME_FROM_CRAFT_ORDER', jobId },
            });
          }
        }
        // STACKABLE : déjà décrémenté au launch. Le reste
        // (reservedQuantity − consumedQuantity) est restitué au claim/cancel
        // (Phase 3). Aucun re-décrément ni matérialisation ici.
      }
      if (ingredients.length > 0) await manager.save(CraftJobIngredient, ingredients);

      // XP uniquement si ≥ 1 succès (ADR-0016), multipliée par le nombre de succès.
      if (successes > 0) {
        if (skillDef && skillDef.enabled) {
          const skillXp = calculateSkillXp(this.buildCraftSkillXpContext(job, skillLevel));
          if (skillXp) {
            await this.skillsService.applySkillXpInTx(
              job.characterId,
              skillXp.skillDefinitionKey,
              skillXp.xpAmount * successes,
              manager,
            );
          }
        }
        if (job.craftCharacterXpReward > 0) {
          await this.progressionService.applyCharacterXpInTx(
            job.characterId,
            job.craftCharacterXpReward * successes,
            ProgressionSource.CRAFT,
            manager,
          );
        }
      }

      job.state = successes > 0 ? CraftJobState.COMPLETED : CraftJobState.FAILED;
      job.successes = successes;
      job.failures = failures;
      job.completedAt = new Date();
      await manager.save(CraftJob, job);

      return { jobId, state: job.state, successes, failures };
    });
  }

  /**
   * Claim d'un CraftJob COMPLETED (ADR-0009, Phase 3). Transaction unique.
   *
   * SEUL endroit où `ItemMaterializationService` est appelé pour un CraftJob :
   * l'output n'existe qu'ici (ni au launch, ni au scheduler). Les objets créés
   * sont EXACTEMENT ceux qu'aurait produits le craft instantané (mêmes quantités
   * résolues, même source CRAFT, même destination INVENTORY).
   *
   * Idempotent : un job déjà CLAIMED lève 409 (jamais deux créations). Un job
   * FAILED ne peut jamais être claim. Le snapshot (`craft_job_output.resolvedQuantity`)
   * est l'unique vérité — la recette/outputs vivants ne sont jamais relus.
   */
  async claim(characterId: string, jobId: string): Promise<CraftJobClaimResult> {
    return this.dataSource.transaction(async (manager) => {
      const job = await manager
        .getRepository(CraftJob)
        .createQueryBuilder('j')
        .setLock('pessimistic_write')
        .where('j.id = :id', { id: jobId })
        .getOne();
      if (!job) throw new NotFoundException(`CraftJob ${jobId} introuvable`);
      if (job.characterId !== characterId) {
        throw new ForbiddenException(`CraftJob ${jobId} n'appartient pas au personnage`);
      }
      if (job.state === CraftJobState.CLAIMED) {
        throw new ConflictException(`CraftJob ${jobId} déjà réclamé`);
      }
      if (job.state === CraftJobState.FAILED) {
        throw new BadRequestException(`CraftJob ${jobId} en échec : rien à réclamer`);
      }
      if (job.state !== CraftJobState.COMPLETED) {
        throw new BadRequestException(`CraftJob ${jobId} pas encore terminé (état ${job.state})`);
      }

      // Snapshot uniquement — jamais la recette/outputs vivants.
      const outputs = await manager.find(CraftJobOutput, { where: { jobId } });
      const lootEntries: LootEntry[] = outputs
        .filter((o) => o.resolvedQuantity > 0)
        .map((o) => ({ itemId: o.itemId, quantity: o.resolvedQuantity }));

      if (lootEntries.length > 0) {
        // Unique appel à ItemMaterializationService pour un CraftJob.
        await this.itemMaterialization.materialize(manager, lootEntries, {
          source: ItemInstanceSource.CRAFT,
          destination: { type: 'INVENTORY', characterId },
          ownerId: characterId,
        });
      }

      job.state = CraftJobState.CLAIMED;
      job.claimedAt = new Date();
      await manager.save(CraftJob, job);

      return { jobId, state: CraftJobState.CLAIMED, produced: lootEntries };
    });
  }

  /** IDs des jobs dus (RUNNING, finishAt <= now), bornés — pour le scheduler. */
  async findDueJobIds(now: Date, limit: number): Promise<string[]> {
    const rows = await this.dataSource.getRepository(CraftJob).find({
      where: { state: CraftJobState.RUNNING, finishAt: LessThanOrEqual(now) },
      order: { finishAt: 'ASC' },
      take: limit,
      select: ['id'],
    });
    return rows.map((r) => r.id);
  }

  private buildCraftSkillXpContext(job: CraftJob, skillLevel: number): SkillXpContext {
    return {
      skillDefinitionKey: job.requiredSkillKey,
      domain: 'crafting' as SkillDomain,
      action: 'craft',
      success: true,
      difficulty: Math.max(0, Math.min(100, job.craftingDifficulty ?? 0)),
      quality: null,
      characterLevel: 1,
      skillLevel,
      duration: job.craftTimeMs > 0 ? job.craftTimeMs : null,
      damage: null,
      blockedDamage: null,
      healedAmount: null,
      buffs: [],
      debuffs: [],
    };
  }
}
