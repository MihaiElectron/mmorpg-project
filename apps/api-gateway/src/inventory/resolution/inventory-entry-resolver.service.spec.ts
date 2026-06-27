import { NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Inventory } from '../entities/inventory.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../../item-instances/entities/item-instance.entity';
import { InventoryEntryResolverService } from './inventory-entry-resolver.service';

const CHARACTER_ID = "char-uuid-1";
const ENTRY_ID = "entry-uuid-1";
const ITEM_ID = "item-uuid-1";

function makeItem() {
  return { id: ITEM_ID, name: "Baton", type: "material", category: "wooden_stick", image: null };
}

function makeInventory(overrides: Partial<Inventory> = {}): Inventory {
  return {
    id: ENTRY_ID,
    character: { id: CHARACTER_ID } as any,
    item: makeItem() as any,
    quantity: 5,
    equipped: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Inventory;
}

function makeInstance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: ENTRY_ID,
    itemId: ITEM_ID,
    ownerType: "character",
    ownerId: CHARACTER_ID,
    state: ItemInstanceState.AVAILABLE,
    containerType: ItemInstanceContainerType.INVENTORY,
    containerId: CHARACTER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ItemInstance;
}

function makeService(instanceResult: ItemInstance | null, inventoryResult: Inventory | null) {
  const instanceRepo = { findOne: jest.fn().mockResolvedValue(instanceResult) };
  const inventoryRepo = { findOne: jest.fn().mockResolvedValue(inventoryResult) };
  return new InventoryEntryResolverService(inventoryRepo as any, instanceRepo as any);
}

describe("InventoryEntryResolverService.resolve", () => {
  it("retourne STACK si inventoryEntryId correspond à une ligne Inventory", async () => {
    const service = makeService(null, makeInventory());

    const result = await service.resolve(CHARACTER_ID, ENTRY_ID);

    expect(result.type).toBe("STACK");
    if (result.type === "STACK") {
      expect(result.itemId).toBe(ITEM_ID);
      expect(result.inventory.id).toBe(ENTRY_ID);
    }
  });

  it("retourne INSTANCE si inventoryEntryId correspond à un ItemInstance actif", async () => {
    const service = makeService(makeInstance(), null);

    const result = await service.resolve(CHARACTER_ID, ENTRY_ID);

    expect(result.type).toBe("INSTANCE");
    if (result.type === "INSTANCE") {
      expect(result.itemId).toBe(ITEM_ID);
      expect(result.instance.id).toBe(ENTRY_ID);
    }
  });

  it("préfère INSTANCE si les deux sont trouvés (UUID collision improbable)", async () => {
    const service = makeService(makeInstance(), makeInventory());

    const result = await service.resolve(CHARACTER_ID, ENTRY_ID);

    expect(result.type).toBe("INSTANCE");
  });

  it("lève NotFoundException si aucune entrée ne correspond", async () => {
    const service = makeService(null, null);

    await expect(service.resolve(CHARACTER_ID, ENTRY_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lève NotFoundException si le propriétaire ne correspond pas", async () => {
    // Le repo renvoie null car la requête filtre par ownerId — simulé en renvoyant null
    const service = makeService(null, null);

    await expect(service.resolve("autre-char", ENTRY_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("ignore une ItemInstance DESTROYED et tombe en fallback Inventory", async () => {
    // Le repo renvoie null car la requête filtre state NOT IN (DESTROYED, ARCHIVED)
    // Simulé ici par null (le filtre TypeORM est exercé en intégration)
    const service = makeService(null, makeInventory());

    const result = await service.resolve(CHARACTER_ID, ENTRY_ID);

    expect(result.type).toBe("STACK");
  });
});

describe("InventoryEntryResolverService.resolveWithinTransaction", () => {
  it("retourne STACK depuis un EntityManager transactionnel", async () => {
    const inv = makeInventory();
    const manager = {
      findOne: jest.fn()
        .mockResolvedValueOnce(null)  // instance : non trouvée
        .mockResolvedValueOnce(inv),  // inventory : trouvée
    } as unknown as EntityManager;

    const service = makeService(null, null);
    const result = await service.resolveWithinTransaction(manager, CHARACTER_ID, ENTRY_ID);

    expect(result.type).toBe("STACK");
    if (result.type === "STACK") {
      expect(result.itemId).toBe(ITEM_ID);
    }
    expect(manager.findOne).toHaveBeenCalledTimes(2);
  });

  it("retourne INSTANCE depuis un EntityManager transactionnel", async () => {
    const inst = makeInstance();
    const manager = {
      findOne: jest.fn().mockResolvedValueOnce(inst),
    } as unknown as EntityManager;

    const service = makeService(null, null);
    const result = await service.resolveWithinTransaction(manager, CHARACTER_ID, ENTRY_ID);

    expect(result.type).toBe("INSTANCE");
    if (result.type === "INSTANCE") {
      expect(result.itemId).toBe(ITEM_ID);
    }
    expect(manager.findOne).toHaveBeenCalledTimes(1);
  });

  it("lève NotFoundException si aucune entrée dans la transaction", async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as EntityManager;

    const service = makeService(null, null);

    await expect(
      service.resolveWithinTransaction(manager, CHARACTER_ID, ENTRY_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
