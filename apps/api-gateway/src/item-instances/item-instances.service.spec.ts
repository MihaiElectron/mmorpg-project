import { Repository } from 'typeorm';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from './entities/item-instance.entity';
import { CreateItemInstanceParams, ItemInstancesService } from './item-instances.service';

function makeRepo(): jest.Mocked<Repository<ItemInstance>> {
  return {
    create: jest.fn((data) => ({ ...data } as ItemInstance)),
    save: jest.fn(async (v) => ({ id: 'inst-uuid-1', ...v } as ItemInstance)),
  } as unknown as jest.Mocked<Repository<ItemInstance>>;
}

describe("ItemInstancesService", () => {
  let service: ItemInstancesService;
  let repo: jest.Mocked<Repository<ItemInstance>>;

  beforeEach(() => {
    repo = makeRepo();
    service = new ItemInstancesService(repo);
  });

  describe("create", () => {
    const params: CreateItemInstanceParams = {
      itemId: "item-sword-1",
      ownerType: "CHARACTER",
      ownerId: "char-abc",
      state: ItemInstanceState.AVAILABLE,
      containerType: ItemInstanceContainerType.INVENTORY,
      containerId: "char-abc",
    };

    it("persiste l'instance avec les champs fournis", async () => {
      const result = await service.create(params);

      expect(repo.create).toHaveBeenCalledWith({
        itemId: "item-sword-1",
        ownerType: "CHARACTER",
        ownerId: "char-abc",
        state: ItemInstanceState.AVAILABLE,
        containerType: ItemInstanceContainerType.INVENTORY,
        containerId: "char-abc",
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result.id).toBe("inst-uuid-1");
    });

    it("accepte ownerId et containerId null", async () => {
      const noOwnerParams: CreateItemInstanceParams = {
        itemId: "item-key-1",
        ownerType: "NONE",
        ownerId: null,
        state: ItemInstanceState.IN_WORLD,
        containerType: ItemInstanceContainerType.WORLD,
        containerId: null,
      };

      await service.create(noOwnerParams);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: null, containerId: null }),
      );
    });

    it("retourne l'instance sauvegardee avec son id", async () => {
      const result = await service.create(params);
      expect(result).toMatchObject({
        id: "inst-uuid-1",
        itemId: "item-sword-1",
        state: ItemInstanceState.AVAILABLE,
        containerType: ItemInstanceContainerType.INVENTORY,
      });
    });
  });
});
