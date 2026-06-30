import { ItemMaterializationService } from './item-materialization.service';
import { ObjectMode } from '../items/entities/item.entity';
import {
  ItemInstanceContainerType,
  ItemInstanceSource,
  ItemInstanceState,
  ItemInstanceType,
} from '../item-instances/entities/item-instance.entity';
import { WorldItemState } from '../world-items/entities/world-item.entity';
import type { MaterializeContext } from './item-materialization.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<{ id: string; category: string; objectMode: ObjectMode }> = {}) {
  return {
    id: 'item-uuid',
    name: 'Bâton de bois',
    type: 'material',
    category: 'wooden_stick',
    objectMode: ObjectMode.STACKABLE,
    ...overrides,
  } as any;
}

function makeContext(destination: MaterializeContext["destination"]): MaterializeContext {
  return {
    source: ItemInstanceSource.LOOT,
    destination,
    ownerId: 'char-1',
  };
}

function makeManager(itemOverride?: object) {
  const item = itemOverride ?? makeItem();
  const saved: any[] = [];
  const manager: any = {
    findOne: jest.fn().mockResolvedValue(item),
    create: jest.fn().mockImplementation((_Entity, data) => ({ ...data })),
    save: jest.fn().mockImplementation(async (_Entity, entity) => {
      const result = { ...entity, id: entity.id ?? `saved-${saved.length}` };
      saved.push(result);
      return result;
    }),
    getRepository: jest.fn(),
  };
  return manager;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ItemMaterializationService', () => {
  let service: ItemMaterializationService;

  beforeEach(() => {
    service = new ItemMaterializationService();
  });

  describe('STACKABLE + INVENTORY', () => {
    it("crée une nouvelle entrée Inventory si aucune n'existe", async () => {
      const item = makeItem({ objectMode: ObjectMode.STACKABLE });
      const manager = makeManager(item);
      manager.findOne
        .mockResolvedValueOnce(item)     // resolveItem
        .mockResolvedValueOnce(null);    // existing inventory

      const result = await service.materialize(
        manager,
        [{ itemId: 'wooden_stick', quantity: 3 }],
        makeContext({ type: 'INVENTORY', characterId: 'char-1' }),
      );

      expect(result.stacks).toHaveLength(1);
      expect(result.stacks[0].quantity).toBe(3);
      expect(result.worldItems).toHaveLength(0);
      expect(result.instances).toHaveLength(0);
    });

    it("incrémente la quantité si une entrée Inventory existe déjà", async () => {
      const item = makeItem({ objectMode: ObjectMode.STACKABLE });
      const existingInventory = { id: "inv-1", quantity: 5, item, equipped: false };
      const manager = makeManager(item);
      manager.findOne
        .mockResolvedValueOnce(item)
        .mockResolvedValueOnce(existingInventory);
      manager.save.mockImplementation(async (_E, entity) => ({ ...entity }));

      const result = await service.materialize(
        manager,
        [{ itemId: 'wooden_stick', quantity: 2 }],
        makeContext({ type: 'INVENTORY', characterId: 'char-1' }),
      );

      expect(result.stacks[0].quantity).toBe(7);
    });
  });

  describe('STACKABLE + WORLD', () => {
    it("crée un WorldItem en état SPAWNED sans ItemInstance", async () => {
      const item = makeItem({ objectMode: ObjectMode.STACKABLE });
      const manager = makeManager(item);
      manager.findOne.mockResolvedValue(item);

      const result = await service.materialize(
        manager,
        [{ itemId: 'wooden_stick', quantity: 5 }],
        makeContext({ type: 'WORLD', worldX: 1024, worldY: 2048, mapId: 1, ownerCharacterId: null }),
      );

      expect(result.worldItems).toHaveLength(1);
      expect(result.worldItems[0].state).toBe(WorldItemState.SPAWNED);
      expect(result.worldItems[0].quantity).toBe(5);
      expect(result.instances).toHaveLength(0);
    });
  });

  describe('INSTANCE + INVENTORY', () => {
    it("crée une ItemInstance en état AVAILABLE/INVENTORY pour chaque unité", async () => {
      const item = makeItem({ id: 'sword-uuid', category: 'basic_sword', objectMode: ObjectMode.INSTANCE });
      const manager = makeManager(item);
      manager.findOne.mockResolvedValue(item);

      const result = await service.materialize(
        manager,
        [{ itemId: 'sword-uuid', quantity: 1 }],
        makeContext({ type: 'INVENTORY', characterId: 'char-1' }),
      );

      expect(result.instances).toHaveLength(1);
      expect(result.instances[0].state).toBe(ItemInstanceState.AVAILABLE);
      expect(result.instances[0].containerType).toBe(ItemInstanceContainerType.INVENTORY);
      expect(result.instances[0].containerId).toBe('char-1');
      expect(result.instances[0].instanceType).toBe(ItemInstanceType.NORMAL);
      expect(result.instances[0].quantity).toBeNull();
      expect(result.worldItems).toHaveLength(0);
    });

    it("crée N ItemInstances distinctes si quantity > 1", async () => {
      const item = makeItem({ objectMode: ObjectMode.INSTANCE });
      const manager = makeManager(item);
      manager.findOne.mockResolvedValue(item);

      const result = await service.materialize(
        manager,
        [{ itemId: 'sword-uuid', quantity: 3 }],
        makeContext({ type: 'INVENTORY', characterId: 'char-1' }),
      );

      expect(result.instances).toHaveLength(3);
    });
  });

  describe('INSTANCE + WORLD', () => {
    it("crée un WorldItem + une ItemInstance IN_WORLD avec backfill", async () => {
      const item = makeItem({ objectMode: ObjectMode.INSTANCE });
      const manager: any = {
        findOne: jest.fn().mockResolvedValue(item),
        create: jest.fn().mockImplementation((_E, data) => ({ ...data })),
        save: jest.fn()
          .mockResolvedValueOnce({ id: 'wi-1', itemId: item.id, state: WorldItemState.SPAWNED })
          .mockResolvedValueOnce({ id: 'inst-1', itemId: item.id, state: ItemInstanceState.IN_WORLD, containerType: ItemInstanceContainerType.WORLD, containerId: 'wi-1', instanceType: ItemInstanceType.NORMAL, quantity: null })
          .mockResolvedValueOnce({ id: 'wi-1', itemInstanceId: 'inst-1' }),
      };

      const result = await service.materialize(
        manager,
        [{ itemId: 'sword-uuid', quantity: 1 }],
        makeContext({ type: 'WORLD', worldX: 500, worldY: 600, mapId: 1, ownerCharacterId: null }),
      );

      expect(result.worldItems).toHaveLength(1);
      expect(result.instances).toHaveLength(1);
      expect(result.instances[0].state).toBe(ItemInstanceState.IN_WORLD);
      expect(result.instances[0].containerType).toBe(ItemInstanceContainerType.WORLD);
      expect(result.instances[0].instanceType).toBe(ItemInstanceType.NORMAL);
      expect(result.instances[0].quantity).toBeNull();
      // backfill: itemInstanceId doit être défini sur le WorldItem
      expect(result.worldItems[0].itemInstanceId).toBe('inst-1');
    });

    it("rollback si la sauvegarde WorldItem échoue (propagation de l'erreur)", async () => {
      const item = makeItem({ objectMode: ObjectMode.INSTANCE });
      const manager: any = {
        findOne: jest.fn().mockResolvedValue(item),
        create: jest.fn().mockImplementation((_E, data) => ({ ...data })),
        save: jest.fn().mockRejectedValue(new Error("DB constraint")),
      };

      await expect(
        service.materialize(
          manager,
          [{ itemId: 'sword-uuid', quantity: 1 }],
          makeContext({ type: 'WORLD', worldX: 0, worldY: 0, mapId: 1 }),
        ),
      ).rejects.toThrow("DB constraint");
    });
  });

  describe('cas limites', () => {
    it("ignore les entrées avec quantity <= 0", async () => {
      const item = makeItem();
      const manager = makeManager(item);

      const result = await service.materialize(
        manager,
        [{ itemId: 'wooden_stick', quantity: 0 }],
        makeContext({ type: 'INVENTORY', characterId: 'char-1' }),
      );

      expect(result.stacks).toHaveLength(0);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it("ignore les entrées dont l'item est introuvable", async () => {
      const manager: any = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        save: jest.fn(),
      };

      const result = await service.materialize(
        manager,
        [{ itemId: 'nonexistent', quantity: 1 }],
        makeContext({ type: 'INVENTORY', characterId: 'char-1' }),
      );

      expect(result.stacks).toHaveLength(0);
      expect(result.instances).toHaveLength(0);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });
});
