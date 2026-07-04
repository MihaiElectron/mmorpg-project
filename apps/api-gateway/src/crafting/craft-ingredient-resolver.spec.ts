import { BadRequestException } from '@nestjs/common';
import { CraftIngredientResolver } from './craft-ingredient-resolver';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
  ItemInstanceType,
} from '../item-instances/entities/item-instance.entity';

function makeItem(id: string, objectMode = ObjectMode.STACKABLE): Item {
  return { id, objectMode } as Item;
}
function makeInvRow(itemId: string, quantity: number): Inventory {
  return { id: `inv-${itemId}`, item: { id: itemId }, quantity } as Inventory;
}
function makeInstance(id: string): Partial<ItemInstance> {
  return { id };
}

/** Manager mock : find(Item/Inventory) + getRepository(ItemInstance).createQueryBuilder. */
function makeManager(opts: {
  items?: Item[];
  inventoryRows?: Inventory[];
  instances?: Partial<ItemInstance>[];
}) {
  const qb: any = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(opts.instances ?? []),
  };
  const manager: any = {
    find: jest.fn((entity: unknown) => {
      if (entity === Item) return Promise.resolve(opts.items ?? []);
      if (entity === Inventory) return Promise.resolve(opts.inventoryRows ?? []);
      return Promise.resolve([]);
    }),
    getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn().mockReturnValue(qb) }),
    save: jest.fn(),
    remove: jest.fn(),
    create: jest.fn(),
    _qb: qb,
  };
  return manager;
}

describe('CraftIngredientResolver', () => {
  let resolver: CraftIngredientResolver;

  beforeEach(() => {
    resolver = new CraftIngredientResolver();
  });

  it('STACKABLE suffisant : retourne la ligne Inventory, sans erreur', async () => {
    const manager = makeManager({
      items: [makeItem('item-ore', ObjectMode.STACKABLE)],
      inventoryRows: [makeInvRow('item-ore', 6)],
    });

    const res = await resolver.resolve(manager, 'char-1', [{ itemId: 'item-ore', requiredQuantity: 3 }], 2);

    expect(res.isInstanceIngredient('item-ore')).toBe(false);
    expect(res.stackRowByItemId.get('item-ore')?.quantity).toBe(6);
  });

  it('STACKABLE insuffisant (besoin 6, stock 5) : BadRequestException', async () => {
    const manager = makeManager({
      items: [makeItem('item-ore', ObjectMode.STACKABLE)],
      inventoryRows: [makeInvRow('item-ore', 5)],
    });

    await expect(
      resolver.resolve(manager, 'char-1', [{ itemId: 'item-ore', requiredQuantity: 3 }], 2),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('INSTANCE suffisant : retourne les instances sélectionnables', async () => {
    const manager = makeManager({
      items: [makeItem('item-sword', ObjectMode.INSTANCE)],
      instances: [makeInstance('inst-0'), makeInstance('inst-1')],
    });

    const res = await resolver.resolve(manager, 'char-1', [{ itemId: 'item-sword', requiredQuantity: 1 }], 2);

    expect(res.isInstanceIngredient('item-sword')).toBe(true);
    expect(res.instancesByItemId.get('item-sword')?.map((i) => i.id)).toEqual(['inst-0', 'inst-1']);
  });

  it('INSTANCE insuffisant (besoin 2, dispo 1) : BadRequestException', async () => {
    const manager = makeManager({
      items: [makeItem('item-sword', ObjectMode.INSTANCE)],
      instances: [makeInstance('inst-0')],
    });

    await expect(
      resolver.resolve(manager, 'char-1', [{ itemId: 'item-sword', requiredQuantity: 1 }], 2),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filtre INSTANCE : ne sélectionne que AVAILABLE / INVENTORY / NORMAL du personnage (exclut équipé/mail/auction/craft order/détruit/LOT/world)', async () => {
    const manager = makeManager({
      items: [makeItem('item-sword', ObjectMode.INSTANCE)],
      instances: [makeInstance('inst-0')],
    });

    await resolver.resolve(manager, 'char-9', [{ itemId: 'item-sword', requiredQuantity: 1 }], 1);

    expect(manager._qb.where).toHaveBeenCalledWith(
      expect.stringContaining('i.state = :state'),
      expect.objectContaining({
        itemId: 'item-sword',
        ownerId: 'char-9',
        containerType: ItemInstanceContainerType.INVENTORY,
        state: ItemInstanceState.AVAILABLE,
        instanceType: ItemInstanceType.NORMAL,
      }),
    );
  });

  it('LECTURE SEULE : ne consomme, ne réserve, ne crée, ne détruit rien', async () => {
    const manager = makeManager({
      items: [makeItem('item-ore', ObjectMode.STACKABLE)],
      inventoryRows: [makeInvRow('item-ore', 10)],
    });

    await resolver.resolve(manager, 'char-1', [{ itemId: 'item-ore', requiredQuantity: 2 }], 1);

    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.remove).not.toHaveBeenCalled();
    expect(manager.create).not.toHaveBeenCalled();
  });

  it('mélange STACKABLE + INSTANCE : chacun résolu sur sa source', async () => {
    const manager = makeManager({
      items: [makeItem('item-ore', ObjectMode.STACKABLE), makeItem('item-sword', ObjectMode.INSTANCE)],
      inventoryRows: [makeInvRow('item-ore', 4)],
      instances: [makeInstance('inst-0')],
    });

    const res = await resolver.resolve(
      manager,
      'char-1',
      [{ itemId: 'item-ore', requiredQuantity: 2 }, { itemId: 'item-sword', requiredQuantity: 1 }],
      1,
    );

    expect(res.stackRowByItemId.get('item-ore')?.quantity).toBe(4);
    expect(res.instancesByItemId.get('item-sword')).toHaveLength(1);
  });
});
