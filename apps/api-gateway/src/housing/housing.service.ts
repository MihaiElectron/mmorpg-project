import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../item-instances/entities/item-instance.entity';
import { Item } from '../items/entities/item.entity';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { InventoryEntryDto } from '../inventory/projection/inventory-entry.dto';
import { mapInstanceToEntry } from '../inventory/projection/inventory-entry.mapper';
import { House } from './entities/house.entity';

const EMPTY_EQUIPPED_SETS = {
  equippedItemIds: new Set<string>(),
  equippedInstanceIds: new Set<string>(),
};

@Injectable()
export class HousingService {
  constructor(
    @InjectRepository(House)
    private readonly houses: Repository<House>,
    @InjectRepository(ItemInstance)
    private readonly instances: Repository<ItemInstance>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    private readonly dataSource: DataSource,
    private readonly itemTransfer: ItemTransferService,
  ) {}

  // ── Lecture ───────────────────────────────────────────────────────────────

  async listContents(characterId: string, houseId: string): Promise<InventoryEntryDto[]> {
    await this.resolveHouseAndAssertOwner(houseId, characterId);

    const stored = await this.instances.find({
      where: {
        containerType: ItemInstanceContainerType.HOUSING,
        containerId: houseId,
        state: ItemInstanceState.IN_HOUSING,
      },
    });

    if (stored.length === 0) return [];

    const itemIds = [...new Set(stored.map((i) => i.itemId))];
    const itemList = await this.items.findBy({ id: In(itemIds) });
    const itemMap = new Map(itemList.map((item) => [item.id, item]));

    return stored
      .map((inst) => {
        const item = itemMap.get(inst.itemId);
        if (!item) return null;
        return mapInstanceToEntry(inst, item, EMPTY_EQUIPPED_SETS);
      })
      .filter((e): e is InventoryEntryDto => e !== null);
  }

  // ── Dépôt ─────────────────────────────────────────────────────────────────

  async deposit(
    characterId: string,
    houseId: string,
    itemInstanceId: string,
  ): Promise<void> {
    const house = await this.resolveHouseAndAssertOwner(houseId, characterId);

    await this.dataSource.transaction(async (manager) => {
      const raw = await manager.findOne(ItemInstance, {
        where: { id: itemInstanceId },
      });
      if (!raw) throw new NotFoundException(`ItemInstance ${itemInstanceId} not found`);
      this.assertOwner(raw, characterId);
      this.assertDepositableContainer(raw);

      await this.itemTransfer.transfer(manager, itemInstanceId, {
        requesterId: characterId,
        transition: { type: 'STORE_HOUSE', houseId: house.id },
      });
    });
  }

  // ── Retrait ───────────────────────────────────────────────────────────────

  async withdraw(
    characterId: string,
    houseId: string,
    itemInstanceId: string,
  ): Promise<void> {
    const house = await this.resolveHouseAndAssertOwner(houseId, characterId);

    await this.dataSource.transaction(async (manager) => {
      const raw = await manager.findOne(ItemInstance, {
        where: { id: itemInstanceId },
      });
      if (!raw) throw new NotFoundException(`ItemInstance ${itemInstanceId} not found`);
      this.assertInHousing(raw, house.id);

      await this.itemTransfer.transfer(manager, itemInstanceId, {
        requesterId: null,
        transition: { type: 'WITHDRAW_HOUSE', houseId: house.id, characterId },
      });
    });
  }

  // ── Helpers privés ────────────────────────────────────────────────────────

  private async resolveHouseAndAssertOwner(
    houseId: string,
    characterId: string,
  ): Promise<House> {
    const house = await this.houses.findOneBy({ id: houseId });
    if (!house) throw new NotFoundException(`House ${houseId} not found`);
    if (house.ownerCharacterId !== characterId) {
      throw new ForbiddenException('Only the house owner can perform this action');
    }
    return house;
  }

  private assertOwner(instance: ItemInstance, characterId: string): void {
    if (instance.ownerId !== characterId) {
      throw new BadRequestException('Instance does not belong to this character');
    }
  }

  private assertInHousing(instance: ItemInstance, houseId: string): void {
    if (instance.containerType !== ItemInstanceContainerType.HOUSING) {
      throw new BadRequestException(
        `Instance is not in housing (container: ${instance.containerType})`,
      );
    }
    if (instance.containerId !== houseId) {
      throw new BadRequestException('Instance belongs to a different house');
    }
  }

  private assertDepositableContainer(instance: ItemInstance): void {
    const blocked: ItemInstanceContainerType[] = [
      ItemInstanceContainerType.EQUIPMENT,
      ItemInstanceContainerType.AUCTION,
      ItemInstanceContainerType.WORLD,
      ItemInstanceContainerType.BANK,
      ItemInstanceContainerType.MAIL,
      ItemInstanceContainerType.GUILD_STORAGE,
      ItemInstanceContainerType.HOUSING,
      ItemInstanceContainerType.CRAFT_ORDER,
    ];
    if (blocked.includes(instance.containerType)) {
      throw new BadRequestException(
        `Cannot deposit: instance is in container ${instance.containerType}`,
      );
    }
  }
}
