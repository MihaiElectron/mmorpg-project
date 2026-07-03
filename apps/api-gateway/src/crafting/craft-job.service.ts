import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
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
import { CraftingRecipe } from './entities/crafting-recipe.entity';
import { CraftingService } from './crafting.service';
import { CraftJob, CraftJobState } from './entities/craft-job.entity';
import { CraftJobIngredient } from './entities/craft-job-ingredient.entity';
import { CraftJobOutput } from './entities/craft-job-output.entity';

// Versions courantes figées dans chaque job au lancement (ADR-0009).
export const CRAFT_JOB_VERSION = 1;
export const CRAFT_SERVER_FORMULA_VERSION = 1;

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
  constructor(
    private readonly dataSource: DataSource,
    private readonly skillsService: SkillsService,
    private readonly itemTransferService: ItemTransferService,
    private readonly craftingService: CraftingService,
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
}
