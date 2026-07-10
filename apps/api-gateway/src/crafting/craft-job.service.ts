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
import { MasteryDefinition } from '../masteries/entities/mastery-definition.entity';
import { MasteriesService, MasteryUpdatePayload } from '../masteries/masteries.service';
import { WorldService } from '../world/world.service';
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
import { calculateMasteryXp } from '../mastery-xp-calculator/mastery-xp-calculator';
import { MasteryDomain, MasteryXpContext } from '../mastery-xp-calculator/mastery-xp-context';
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingService } from './crafting.service';
import { MIN_CRAFT_TIME_MS, FAILURE_MASTERY_XP_MULTIPLIER } from './crafting.constants';
import { CraftIngredientResolver } from './craft-ingredient-resolver';
import { computeCraftSuccessRate } from './craft-success-rate';
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
  grantedCharacterXp: number;
  grantedMasteryXp: number;
}

/**
 * Résumé d'un claim réussi (résultat déjà accordé à la complétion). Les items
 * (`produced`/`ingredientsConsumed`) sont exposés par itemId + quantité ; le
 * contrôleur y adjoint nom/image depuis le catalogue Item.
 */
export interface CraftJobClaimResult {
  jobId: string;
  state: CraftJobState.CLAIMED;
  recipeName: string;
  quantity: number;
  successes: number;
  failures: number;
  produced: { itemId: string; quantity: number }[];
  ingredientsConsumed: { itemId: string; quantity: number }[];
  grantedCharacterXp: number;
  grantedMasteryXp: number;
  completedAt: Date | null;
  claimedAt: Date | null;
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
    private readonly masteriesService: MasteriesService,
    private readonly itemTransferService: ItemTransferService,
    private readonly craftingService: CraftingService,
    private readonly progressionService: ProgressionService,
    private readonly itemMaterialization: ItemMaterializationService,
    private readonly craftIngredientResolver: CraftIngredientResolver,
    private readonly worldService: WorldService,
  ) {}

  /**
   * Lance une production différée : valide recette/station/mastery/ingrédients,
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

      // ── 4. Mastery requis ────────────────────────────────────────────────────
      const masteryDef = await manager.findOne(MasteryDefinition, {
        where: { key: recipe.requiredMasteryKey },
      });
      if (!masteryDef) {
        throw new NotFoundException(`Mastery "${recipe.requiredMasteryKey}" introuvable`);
      }
      if (!masteryDef.enabled) {
        throw new BadRequestException(`Mastery "${masteryDef.key}" désactivé`);
      }
      const playerMastery = await this.masteriesService.getOrCreatePlayerMasteryInTx(
        characterId,
        masteryDef,
        manager,
      );
      if (playerMastery.level < recipe.requiredMasteryLevel) {
        throw new BadRequestException(
          `Niveau ${recipe.requiredMasteryLevel} requis en ${masteryDef.key}, niveau actuel : ${playerMastery.level}`,
        );
      }

      // ── 5. Résolution + validation des ingrédients (lecture seule, partagée) ─
      // CraftIngredientResolver verrouille et valide STACKABLE (Inventory) et
      // INSTANCE (AVAILABLE/INVENTORY/NORMAL). Ce service RÉSERVE ensuite (escrow)
      // au lieu de consommer — aucune matérialisation ici.
      const {
        objectModeByItemId,
        isInstanceIngredient,
        stackRowByItemId: invMap,
        instancesByItemId: lockedInstancesByItemId,
      } = await this.craftIngredientResolver.resolve(
        manager,
        characterId,
        recipe.ingredients,
        quantity,
      );

      // ── 6. Création du job (snapshot immuable) ─────────────────────────────
      // Garde Runtime : aucune fabrication joueur ne peut avoir une durée unitaire
      // < MIN_CRAFT_TIME_MS, même si la recette DB est legacy/corrompue. On clampe
      // la durée effective (le DevTools continue de signaler la recette invalide).
      const effectiveCraftTimeMs = Math.max(recipe.craftTimeMs ?? 0, MIN_CRAFT_TIME_MS);
      if ((recipe.craftTimeMs ?? 0) < MIN_CRAFT_TIME_MS) {
        this.logger.warn(
          `Recette ${recipe.id} : craftTimeMs=${recipe.craftTimeMs} < ${MIN_CRAFT_TIME_MS} — durée clampée à ${MIN_CRAFT_TIME_MS} ms (à corriger dans le Recipe Editor).`,
        );
      }
      const startedAt = new Date();
      const finishAt = new Date(startedAt.getTime() + effectiveCraftTimeMs * quantity);
      const savedJob = await manager.save(
        CraftJob,
        manager.create(CraftJob, {
          characterId,
          state: CraftJobState.RUNNING,
          recipeId: recipe.id,
          recipeName: recipe.name,
          recipeVersion: recipe.version ?? 1,
          jobVersion: CRAFT_JOB_VERSION,
          serverFormulaVersion: CRAFT_SERVER_FORMULA_VERSION,
          stationId,
          stationType: recipe.stationType,
          quantity,
          craftTimeMs: effectiveCraftTimeMs,
          craftingDifficulty: recipe.craftingDifficulty ?? 0,
          requiredMasteryKey: recipe.requiredMasteryKey,
          requiredMasteryLevel: recipe.requiredMasteryLevel,
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
    // Capturés dans la transaction, émis uniquement après commit (jamais sur
    // rollback) — le scheduler n'a pas de socket requête, on passe par WorldService.
    let masteryUpdate: MasteryUpdatePayload | null = null;
    let completedCharacterId: string | null = null;
    const result = await this.dataSource.transaction(async (manager) => {
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

      // Niveau de mastery courant (le mastery appartient au joueur, jamais relu de la
      // recette vivante). Si le mastery a disparu, on complète sans bonus ni XP.
      const masteryDef = await manager.findOne(MasteryDefinition, {
        where: { key: job.requiredMasteryKey },
      });
      let masteryLevel = job.requiredMasteryLevel;
      if (masteryDef && masteryDef.enabled) {
        const playerMastery = await this.masteriesService.getOrCreatePlayerMasteryInTx(
          job.characterId,
          masteryDef,
          manager,
        );
        masteryLevel = playerMastery.level;
      }

      // Taux de succès depuis le SNAPSHOT uniquement (jamais la recette vivante),
      // via la fonction pure de calcul du taux de succès.
      const successRate = computeCraftSuccessRate({
        baseSuccessRate: job.baseSuccessRate,
        successBonusPerLevel: job.successBonusPerLevel,
        minSuccessRate: job.minSuccessRate,
        maxSuccessRate: job.maxSuccessRate,
        requiredMasteryLevel: job.requiredMasteryLevel,
        masteryLevel,
      });

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

      // XP accordée à la complétion (ADR-0016 + règle d'échec V1). L'XP réellement
      // créditée est FIGÉE sur le job (grantedCharacterXp/grantedMasteryXp) pour être
      // affichée telle quelle — jamais recalculée côté client.
      // - Succès : XP perso pleine (craftCharacterXpReward) + XP mastery pleine, ×succès.
      // - Échec  : 0 XP perso + FAILURE_MASTERY_XP_MULTIPLIER × XP mastery succès, ×échec.
      let perSuccessMasteryXp = 0;
      let masteryDefinitionKey: string | null = null;
      if (masteryDef && masteryDef.enabled) {
        const masteryXp = calculateMasteryXp(this.buildCraftMasteryXpContext(job, masteryLevel));
        if (masteryXp) {
          perSuccessMasteryXp = masteryXp.xpAmount;
          masteryDefinitionKey = masteryXp.masteryDefinitionKey;
        }
      }
      const failureMasteryXpPerAttempt = Math.floor(
        perSuccessMasteryXp * FAILURE_MASTERY_XP_MULTIPLIER,
      );
      const grantedMasteryXp =
        perSuccessMasteryXp * successes + failureMasteryXpPerAttempt * failures;
      const grantedCharacterXp = Math.max(0, job.craftCharacterXpReward) * successes;

      if (grantedMasteryXp > 0 && masteryDefinitionKey) {
        masteryUpdate = await this.masteriesService.applyMasteryXpInTx(
          job.characterId,
          masteryDefinitionKey,
          grantedMasteryXp,
          manager,
        );
        completedCharacterId = job.characterId;
      }
      if (grantedCharacterXp > 0) {
        await this.progressionService.applyCharacterXpInTx(
          job.characterId,
          grantedCharacterXp,
          ProgressionSource.CRAFT,
          manager,
        );
      }

      job.state = successes > 0 ? CraftJobState.COMPLETED : CraftJobState.FAILED;
      job.successes = successes;
      job.failures = failures;
      job.grantedCharacterXp = grantedCharacterXp;
      job.grantedMasteryXp = grantedMasteryXp;
      job.completedAt = new Date();
      await manager.save(CraftJob, job);

      return {
        jobId,
        state: job.state,
        successes,
        failures,
        grantedCharacterXp,
        grantedMasteryXp,
      };
    });
    // Masteries V1-B : émission live du même payload que combat/récolte. L'XP a
    // été appliquée UNE seule fois (dans la transaction) — ici on ne fait qu'émettre.
    if (masteryUpdate && completedCharacterId) {
      this.worldService.emitMasteryUpdate(completedCharacterId, masteryUpdate);
    }
    return result;
  }

  /**
   * Claim d'un CraftJob COMPLETED (ADR-0009, Phase 3). Transaction unique.
   *
   * SEUL endroit où `ItemMaterializationService` est appelé pour un CraftJob :
   * l'output n'existe qu'ici (ni au launch, ni au scheduler). Les objets créés
   * proviennent des quantités résolues à la complétion (source CRAFT,
   * destination INVENTORY).
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
      const ingredients = await manager.find(CraftJobIngredient, { where: { jobId } });
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

      return {
        jobId,
        state: CraftJobState.CLAIMED,
        recipeName: job.recipeName || job.recipeId,
        quantity: job.quantity,
        successes: job.successes,
        failures: job.failures,
        produced: lootEntries,
        ingredientsConsumed: ingredients
          .filter((ing) => ing.consumedQuantity > 0)
          .map((ing) => ({ itemId: ing.itemId, quantity: ing.consumedQuantity })),
        grantedCharacterXp: job.grantedCharacterXp,
        grantedMasteryXp: job.grantedMasteryXp,
        completedAt: job.completedAt,
        claimedAt: job.claimedAt,
      };
    });
  }

  /**
   * Liste les CraftJob d'un personnage avec leurs outputs et ingrédients
   * (lecture seule). Tri : RUNNING → COMPLETED → FAILED → CLAIMED, puis finishAt
   * décroissant. Outputs et ingrédients proviennent du snapshot, jamais de la
   * recette vivante.
   */
  async listForCharacter(characterId: string): Promise<CraftJob[]> {
    const jobs = await this.dataSource.getRepository(CraftJob).find({
      where: { characterId },
      relations: ['outputs', 'ingredients'],
    });
    const priority: Record<CraftJobState, number> = {
      [CraftJobState.RUNNING]: 0,
      [CraftJobState.COMPLETED]: 1,
      [CraftJobState.FAILED]: 2,
      [CraftJobState.CLAIMED]: 3,
      [CraftJobState.CANCELLED]: 4,
    };
    return jobs.sort((a, b) => {
      const p = priority[a.state] - priority[b.state];
      if (p !== 0) return p;
      return b.finishAt.getTime() - a.finishAt.getTime();
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

  private buildCraftMasteryXpContext(job: CraftJob, masteryLevel: number): MasteryXpContext {
    return {
      masteryDefinitionKey: job.requiredMasteryKey,
      domain: 'crafting' as MasteryDomain,
      action: 'craft',
      success: true,
      difficulty: Math.max(0, Math.min(100, job.craftingDifficulty ?? 0)),
      quality: null,
      characterLevel: 1,
      masteryLevel,
      duration: job.craftTimeMs > 0 ? job.craftTimeMs : null,
      damage: null,
      blockedDamage: null,
      healedAmount: null,
      buffs: [],
      debuffs: [],
    };
  }
}
