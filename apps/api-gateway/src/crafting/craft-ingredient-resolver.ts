import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
  ItemInstanceType,
} from '../item-instances/entities/item-instance.entity';

export interface CraftIngredientInput {
  itemId: string;
  requiredQuantity: number;
}

export interface ResolvedCraftIngredients {
  /** objectMode par itemId d'ingrédient (défaut STACKABLE si item introuvable). */
  objectModeByItemId: Map<string, ObjectMode>;
  /** true si l'ingrédient est INSTANCE. */
  isInstanceIngredient: (itemId: string) => boolean;
  /** STACKABLE : ligne Inventory verrouillée, par itemId. */
  stackRowByItemId: Map<string, Inventory>;
  /** INSTANCE : instances utilisables verrouillées (AVAILABLE/INVENTORY/NORMAL), par itemId. */
  instancesByItemId: Map<string, ItemInstance[]>;
}

/**
 * CraftIngredientResolver — LECTURE + VALIDATION des ingrédients d'un craft.
 *
 * Ne consomme, ne réserve, ne détruit, ne crée aucun item ; n'accorde aucune XP ;
 * ne matérialise aucun output. Il se contente de :
 *  - résoudre l'objectMode de chaque ingrédient (via `Item`) ;
 *  - verrouiller (pessimistic_write) les sources : `Inventory` pour STACKABLE,
 *    `ItemInstance` pour INSTANCE ;
 *  - sélectionner uniquement les instances **AVAILABLE / INVENTORY / NORMAL** du
 *    personnage — sont donc exclues les instances équipées, en banque, auction,
 *    mail, craft order, détruites, LOT ou dans le monde ;
 *  - valider la disponibilité (`requiredQuantity × quantity`) et lever une erreur
 *    métier lisible si insuffisant.
 *
 * Partagé par `CraftingService.craft()` (legacy/interne) et `CraftJobService.launch()`.
 * Chaque appelant garde sa responsabilité en aval (consommer vs réserver) : le
 * resolver ne fait que fournir les sources verrouillées et validées.
 */
@Injectable()
export class CraftIngredientResolver {
  async resolve(
    manager: EntityManager,
    characterId: string,
    ingredients: ReadonlyArray<CraftIngredientInput>,
    quantity: number,
  ): Promise<ResolvedCraftIngredients> {
    const ingredientItemIds = ingredients.map((i) => i.itemId);

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
    const stackRowByItemId = new Map<string, Inventory>();
    for (const row of inventoryRows) stackRowByItemId.set(row.item.id, row);

    // INSTANCE — instances AVAILABLE/INVENTORY/NORMAL du personnage, verrouillées.
    const instancesByItemId = new Map<string, ItemInstance[]>();
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
      instancesByItemId.set(itemId, instances);
    }

    // Validation : disponible >= requiredQuantity × quantity, sinon erreur métier.
    for (const ing of ingredients) {
      const needed = ing.requiredQuantity * quantity;
      const available = isInstanceIngredient(ing.itemId)
        ? (instancesByItemId.get(ing.itemId)?.length ?? 0)
        : (stackRowByItemId.get(ing.itemId)?.quantity ?? 0);
      if (available < needed) {
        throw new BadRequestException(
          `Inventaire insuffisant : ${available} disponibles, ${needed} requis`,
        );
      }
    }

    return { objectModeByItemId, isInstanceIngredient, stackRowByItemId, instancesByItemId };
  }
}
