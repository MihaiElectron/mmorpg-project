import { ItemController } from './item.controller';
import { ItemService } from './item.service';

describe('ItemController', () => {
  let controller: ItemController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };
    controller = new ItemController(service as unknown as ItemService);
  });

  it('liste les items via ItemService', async () => {
    const items = [{ id: 'item-1', name: 'Bâton de bois' }];
    service.findAll.mockResolvedValue(items);

    await expect(controller.findAll()).resolves.toBe(items);
  });

  it('lit un item via ItemService', async () => {
    const item = { id: 'item-1', name: 'Bâton de bois' };
    service.findOne.mockResolvedValue(item);

    await expect(controller.findOne('item-1')).resolves.toBe(item);
    expect(service.findOne).toHaveBeenCalledWith('item-1');
  });

  it('met à jour name/type/category/image via ItemService', async () => {
    const dto = {
      name: 'Bâton poli',
      type: 'material',
      category: 'wooden_stick',
      image: '/assets/images/items/wooden_stick.png',
    };
    service.update.mockResolvedValue({ id: 'item-1', ...dto });

    await expect(controller.update('item-1', dto)).resolves.toEqual({
      id: 'item-1',
      ...dto,
    });
    expect(service.update).toHaveBeenCalledWith('item-1', dto);
  });
});
