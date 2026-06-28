import {
  BadRequestException,
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

const EMPTY_EQUIPPED_SETS = {
  equippedItemIds: new Set<string>(),
  equippedInstanceIds: new Set<string>(),
};

@Injectable()
export class BankService {
  constructor(
    @InjectRepository(ItemInstance)
    private readonly instances: Repository<ItemInstance>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    private readonly dataSource: DataSource,
    private readonly itemTransfer: ItemTransferService,
  ) {}

  // ── Lecture ───────────────────────────────────────────────────────────────

  async listContents(characterId: string): Promise<InventoryEntryDto[]> {
    const bankedInstances = await this.instances.find({
      where: {
        ownerId: characterId,
        containerType: ItemInstanceContainerType.BANK,
        state: ItemInstanceState.IN_BANK,
      },
    });

    if (bankedInstances.length === 0) return [];

    const itemIds = [...new Set(bankedInstances.map((i) => i.itemId))];
    const itemList = await this.items.findBy({ id: In(itemIds) });
    const itemMap = new Map(itemList.map((item) => [item.id, item]));

    return bankedInstances
      .map((inst) => {
        const item = itemMap.get(inst.itemId);
        if (!item) return null;
        return mapInstanceToEntry(inst, item, EMPTY_EQUIPPED_SETS);
      })
      .filter((e): e is InventoryEntryDto => e !== null);
  }

  // ── Dépôt ─────────────────────────────────────────────────────────────────

  async deposit(characterId: string, itemInstanceId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Pré-lecture sans verrou pour valider owner et objectMode
      const raw = await manager.findOne(ItemInstance, {
        where: { id: itemInstanceId },
      });
      if (!raw) throw new NotFoundException(`ItemInstance ${itemInstanceId} not found`);
      this.assertOwner(raw, characterId);
      this.assertNotInRestrictedContainer(raw);

      await this.itemTransfer.transfer(manager, itemInstanceId, {
        requesterId: characterId,
        transition: { type: 'STORE_BANK', characterId },
      });
    });
  }

  // ── Retrait ───────────────────────────────────────────────────────────────

  async withdraw(characterId: string, itemInstanceId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const raw = await manager.findOne(ItemInstance, {
        where: { id: itemInstanceId },
      });
      if (!raw) throw new NotFoundException(`ItemInstance ${itemInstanceId} not found`);
      this.assertOwner(raw, characterId);

      await this.itemTransfer.transfer(manager, itemInstanceId, {
        requesterId: characterId,
        transition: { type: 'WITHDRAW_BANK', characterId },
      });
    });
  }

  // ── Helpers privés ────────────────────────────────────────────────────────

  private assertOwner(instance: ItemInstance, characterId: string): void {
    if (instance.ownerId !== characterId) {
      throw new BadRequestException('Instance does not belong to this character');
    }
  }

  /**
   * Refuse le dépôt si l'objet est équipé, en vente aux enchères, dans le monde
   * ou dans un autre conteneur non-INVENTORY. ItemTransferService vérifie
   * également state=AVAILABLE+container=INVENTORY, mais cette pré-lecture
   * produit un message d'erreur lisible avant le verrou.
   */
  private assertNotInRestrictedContainer(instance: ItemInstance): void {
    const blocked: ItemInstanceContainerType[] = [
      ItemInstanceContainerType.EQUIPMENT,
      ItemInstanceContainerType.AUCTION,
      ItemInstanceContainerType.WORLD,
      ItemInstanceContainerType.BANK,
      ItemInstanceContainerType.MAIL,
      ItemInstanceContainerType.GUILD_STORAGE,
      ItemInstanceContainerType.CRAFT_ORDER,
    ];
    if (blocked.includes(instance.containerType)) {
      throw new BadRequestException(
        `Cannot deposit: instance is in container ${instance.containerType}`,
      );
    }
  }
}
