import { Repository } from 'typeorm';
import { CharacterEquipment } from '../../characters/entities/character-equipment.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../../item-instances/entities/item-instance.entity';
import { Item } from '../../items/entities/item.entity';
import { Inventory } from '../entities/inventory.entity';
import { InventoryProjectionService } from './inventory-projection.service';

const item1 = {
  id: "item-1",
  name: "Baton de bois",
  type: "material",
  category: "wooden_stick",
  image: null,
} as Item;

function makeInventoryRepo() {
  return { find: jest.fn() } as unknown as jest.Mocked<Repository<Inventory>>;
}
function makeInstanceRepo() {
  return { find: jest.fn() } as unknown as jest.Mocked<Repository<ItemInstance>>;
}
function makeEquipmentRepo() {
  return { find: jest.fn() } as unknown as jest.Mocked<Repository<CharacterEquipment>>;
}
function makeItemRepo() {
  return { findBy: jest.fn() } as unknown as jest.Mocked<Repository<Item>>;
}

describe("InventoryProjectionService", () => {
  let service: InventoryProjectionService;
  let inventoryRepo: jest.Mocked<Repository<Inventory>>;
  let instanceRepo: jest.Mocked<Repository<ItemInstance>>;
  let equipmentRepo: jest.Mocked<Repository<CharacterEquipment>>;
  let itemRepo: jest.Mocked<Repository<Item>>;

  beforeEach(() => {
    inventoryRepo = makeInventoryRepo();
    instanceRepo = makeInstanceRepo();
    equipmentRepo = makeEquipmentRepo();
    itemRepo = makeItemRepo();
    service = new InventoryProjectionService(
      inventoryRepo,
      instanceRepo,
      equipmentRepo,
      itemRepo,
    );
  });

  it("retourne un tableau vide si aucun inventaire et aucune instance", async () => {
    inventoryRepo.find.mockResolvedValue([]);
    instanceRepo.find.mockResolvedValue([]);
    equipmentRepo.find.mockResolvedValue([]);

    const result = await service.project("char-1");

    expect(result).toEqual([]);
  });

  it("projette les stacks en InventoryEntryDto avec les champs attendus", async () => {
    const inv = { id: "inv-1", quantity: 3, equipped: false, item: item1 } as Inventory;
    inventoryRepo.find.mockResolvedValue([inv]);
    instanceRepo.find.mockResolvedValue([]);
    equipmentRepo.find.mockResolvedValue([]);

    const result = await service.project("char-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "inv-1",
      instanceId: null,
      quantity: 3,
      equipped: false,
      item: { id: "item-1", name: "Baton de bois", type: "material", category: "wooden_stick", image: null },
    });
  });

  it("calcule equipped depuis CharacterEquipment meme si Inventory.equipped est false", async () => {
    const inv = { id: "inv-1", quantity: 1, equipped: false, item: item1 } as Inventory;
    const equipment = [
      { characterId: "char-1", itemId: "item-1", itemInstanceId: null, slot: "weapon" },
    ] as CharacterEquipment[];
    inventoryRepo.find.mockResolvedValue([inv]);
    instanceRepo.find.mockResolvedValue([]);
    equipmentRepo.find.mockResolvedValue(equipment);

    const result = await service.project("char-1");

    expect(result[0].equipped).toBe(true);
  });

  it("equipped est false quand l item n est pas dans CharacterEquipment meme si Inventory.equipped est true", async () => {
    const inv = { id: "inv-1", quantity: 1, equipped: true, item: item1 } as Inventory;
    inventoryRepo.find.mockResolvedValue([inv]);
    instanceRepo.find.mockResolvedValue([]);
    equipmentRepo.find.mockResolvedValue([]);

    const result = await service.project("char-1");

    expect(result[0].equipped).toBe(false);
  });

  it("projette les ItemInstances actives avec quantity 1 et instanceId", async () => {
    const instance = {
      id: "inst-1",
      itemId: "item-1",
      ownerId: "char-1",
      containerType: ItemInstanceContainerType.INVENTORY,
      state: ItemInstanceState.AVAILABLE,
    } as ItemInstance;
    inventoryRepo.find.mockResolvedValue([]);
    instanceRepo.find.mockResolvedValue([instance]);
    equipmentRepo.find.mockResolvedValue([]);
    itemRepo.findBy.mockResolvedValue([item1]);

    const result = await service.project("char-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "inst-1", instanceId: "inst-1", quantity: 1, equipped: false });
  });

  it("exclut les ItemInstances avec state DESTROYED et n appelle pas itemRepo", async () => {
    const destroyed = {
      id: "inst-2",
      itemId: "item-1",
      ownerId: "char-1",
      containerType: ItemInstanceContainerType.INVENTORY,
      state: ItemInstanceState.DESTROYED,
    } as ItemInstance;
    inventoryRepo.find.mockResolvedValue([]);
    instanceRepo.find.mockResolvedValue([destroyed]);
    equipmentRepo.find.mockResolvedValue([]);

    const result = await service.project("char-1");

    expect(result).toHaveLength(0);
    expect(itemRepo.findBy).not.toHaveBeenCalled();
  });

  it("exclut une instance EQUIPPED de la projection inventaire (query INVENTORY only)", async () => {
    // Le repo n est interroge que sur le container INVENTORY : une instance
    // EQUIPPED (container EQUIPMENT) n est jamais renvoyee par la query.
    inventoryRepo.find.mockResolvedValue([]);
    instanceRepo.find.mockResolvedValue([]);
    equipmentRepo.find.mockResolvedValue([
      { characterId: "char-1", itemId: "item-1", itemInstanceId: "inst-eq", slot: "weapon" },
    ] as CharacterEquipment[]);

    const result = await service.project("char-1");

    expect(result).toHaveLength(0);
    // La query instance ne cible que le container INVENTORY.
    const whereArg = (instanceRepo.find as jest.Mock).mock.calls[0][0].where;
    expect(whereArg).toEqual([
      { ownerId: "char-1", containerType: ItemInstanceContainerType.INVENTORY },
    ]);
  });

  it("filet de securite : exclut une instance orpheline EQUIPPED sans lien CharacterEquipment (repro earring)", async () => {
    // Cas exact du bug : instance EQUIPPED mais aucune ligne CharacterEquipment.
    // Meme si une telle instance remontait (state incoherent), elle ne doit
    // jamais apparaitre comme objet disponible en inventaire.
    const orphan = {
      id: "earring-orphan",
      itemId: "item-1",
      ownerId: "char-1",
      containerType: ItemInstanceContainerType.EQUIPMENT,
      state: ItemInstanceState.EQUIPPED,
    } as ItemInstance;
    inventoryRepo.find.mockResolvedValue([]);
    instanceRepo.find.mockResolvedValue([orphan]);
    equipmentRepo.find.mockResolvedValue([]);
    itemRepo.findBy.mockResolvedValue([item1]);

    const result = await service.project("char-1");

    expect(result).toHaveLength(0);
  });

  it("retourne stacks et instances melanges dans l ordre stacks d abord", async () => {
    const inv = { id: "inv-1", quantity: 3, equipped: false, item: item1 } as Inventory;
    const instance = {
      id: "inst-1",
      itemId: "item-1",
      ownerId: "char-1",
      containerType: ItemInstanceContainerType.INVENTORY,
      state: ItemInstanceState.AVAILABLE,
    } as ItemInstance;
    inventoryRepo.find.mockResolvedValue([inv]);
    instanceRepo.find.mockResolvedValue([instance]);
    equipmentRepo.find.mockResolvedValue([]);
    itemRepo.findBy.mockResolvedValue([item1]);

    const result = await service.project("char-1");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("inv-1");
    expect(result[1].id).toBe("inst-1");
  });
});
