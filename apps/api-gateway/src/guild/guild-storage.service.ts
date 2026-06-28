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
import { Guild } from './entities/guild.entity';

const EMPTY_EQUIPPED_SETS = {
  equippedItemIds: new Set<string>(),
  equippedInstanceIds: new Set<string>(),
};

@Injectable()
export class GuildStorageService {
  constructor(
    @InjectRepository(Guild)
    private readonly guilds: Repository<Guild>,
    @InjectRepository(ItemInstance)
    private readonly instances: Repository<ItemInstance>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    private readonly dataSource: DataSource,
    private readonly itemTransfer: ItemTransferService,
  ) {}

  // ── Lecture ───────────────────────────────────────────────────────────────

  async listContents(characterId: string, guildId: string): Promise<InventoryEntryDto[]> {
    await this.resolveGuildAndAssertMember(guildId, characterId);

    const stored = await this.instances.find({
      where: {
        containerType: ItemInstanceContainerType.GUILD_STORAGE,
        containerId: guildId,
        state: ItemInstanceState.IN_GUILD_STORAGE,
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
    guildId: string,
    itemInstanceId: string,
  ): Promise<void> {
    const guild = await this.resolveGuildAndAssertOwner(guildId, characterId);

    await this.dataSource.transaction(async (manager) => {
      const raw = await manager.findOne(ItemInstance, {
        where: { id: itemInstanceId },
      });
      if (!raw) throw new NotFoundException(`ItemInstance ${itemInstanceId} not found`);
      this.assertOwner(raw, characterId);
      this.assertDepositableContainer(raw);

      await this.itemTransfer.transfer(manager, itemInstanceId, {
        requesterId: characterId,
        transition: { type: 'STORE_GUILD', guildId: guild.id },
      });
    });
  }

  // ── Retrait ───────────────────────────────────────────────────────────────

  async withdraw(
    characterId: string,
    guildId: string,
    itemInstanceId: string,
  ): Promise<void> {
    const guild = await this.resolveGuildAndAssertOwner(guildId, characterId);

    await this.dataSource.transaction(async (manager) => {
      const raw = await manager.findOne(ItemInstance, {
        where: { id: itemInstanceId },
      });
      if (!raw) throw new NotFoundException(`ItemInstance ${itemInstanceId} not found`);
      this.assertInGuildStorage(raw, guild.id);

      await this.itemTransfer.transfer(manager, itemInstanceId, {
        requesterId: null,
        transition: { type: 'WITHDRAW_GUILD', guildId: guild.id, characterId },
      });
    });
  }

  // ── Helpers privés ────────────────────────────────────────────────────────

  private async resolveGuildAndAssertOwner(
    guildId: string,
    characterId: string,
  ): Promise<Guild> {
    const guild = await this.guilds.findOneBy({ id: guildId });
    if (!guild) throw new NotFoundException(`Guild ${guildId} not found`);
    if (guild.ownerCharacterId !== characterId) {
      throw new ForbiddenException('Only the guild owner can perform this action');
    }
    return guild;
  }

  private async resolveGuildAndAssertMember(
    guildId: string,
    characterId: string,
  ): Promise<Guild> {
    const guild = await this.guilds.findOneBy({ id: guildId });
    if (!guild) throw new NotFoundException(`Guild ${guildId} not found`);
    // MVP : seul le propriétaire est considéré membre
    if (guild.ownerCharacterId !== characterId) {
      throw new ForbiddenException('Only the guild owner can access guild storage in MVP');
    }
    return guild;
  }

  private assertOwner(instance: ItemInstance, characterId: string): void {
    if (instance.ownerId !== characterId) {
      throw new BadRequestException('Instance does not belong to this character');
    }
  }

  private assertInGuildStorage(instance: ItemInstance, guildId: string): void {
    if (instance.containerType !== ItemInstanceContainerType.GUILD_STORAGE) {
      throw new BadRequestException(
        `Instance is not in guild storage (container: ${instance.containerType})`,
      );
    }
    if (instance.containerId !== guildId) {
      throw new BadRequestException('Instance belongs to a different guild');
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
      ItemInstanceContainerType.CRAFT_ORDER,
    ];
    if (blocked.includes(instance.containerType)) {
      throw new BadRequestException(
        `Cannot deposit: instance is in container ${instance.containerType}`,
      );
    }
  }
}
