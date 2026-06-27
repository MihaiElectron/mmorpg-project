import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThanOrEqual, Repository } from 'typeorm';
import { Server } from 'socket.io';
import { Character } from '../characters/entities/character.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item } from '../items/entities/item.entity';
import { getMapRoomId } from '../common/socket-rooms';
import { chebyshevDistanceWU } from '../common/world-coordinates';
import { WorldItem, WorldItemState } from './entities/world-item.entity';

export const WORLD_ITEM_PICKUP_RANGE_WU = 1600;

export interface SpawnWorldItemInput {
  itemId: string;
  quantity: number;
  worldX: number;
  worldY: number;
  mapId: number;
  ownerCharacterId?: string | null;
  expiresAt?: Date | null;
  itemInstanceId?: string | null;
}

export interface PickupWorldItemInput {
  worldItemId: string;
  characterId: string;
  worldX: number;
  worldY: number;
  mapId: number;
}

export interface DropInventoryItemInput {
  characterId: string;
  itemId: string;
  quantity: number;
  worldX: number;
  worldY: number;
  mapId: number;
}

export interface DropInventoryItemResult {
  inventoryQuantity: number;
  worldItem: WorldItem;
}

export interface WorldItemDto {
  id: string;
  itemId: string;
  quantity: number;
  itemInstanceId: string | null;
  worldX: number;
  worldY: number;
  mapId: number;
  ownerCharacterId: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  state: WorldItemState;
  item: {
    id: string;
    name: string;
    type: string;
    category: string;
    image: string | null;
  } | null;
}

@Injectable()
export class WorldItemService {
  private server: Server | null = null;

  constructor(
    @InjectRepository(WorldItem)
    private readonly worldItems: Repository<WorldItem>,
    @InjectRepository(Item)
    private readonly items: Repository<Item>,
    @InjectRepository(Character)
    private readonly characters: Repository<Character>,
    private readonly dataSource: DataSource,
  ) {}

  setServer(server: Server) {
    this.server = server;
  }

  async spawnItem(input: SpawnWorldItemInput): Promise<WorldItem> {
    this.assertValidSpawnInput(input);

    const item = await this.resolveItem(input.itemId);
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    let ownerCharacter: Character | null = null;
    if (input.ownerCharacterId) {
      ownerCharacter = await this.characters.findOneBy({ id: input.ownerCharacterId });
      if (!ownerCharacter) {
        throw new NotFoundException('Owner character not found');
      }
    }

    const worldItem = this.worldItems.create({
      item,
      itemId: item.id,
      quantity: input.quantity,
      itemInstanceId: input.itemInstanceId ?? null,
      worldX: Math.round(input.worldX),
      worldY: Math.round(input.worldY),
      mapId: Math.round(input.mapId),
      ownerCharacter,
      ownerCharacterId: ownerCharacter?.id ?? null,
      expiresAt: input.expiresAt ?? null,
      state: WorldItemState.SPAWNED,
    });

    const saved = await this.worldItems.save(worldItem);
    saved.item = item;
    this.emitSpawn(saved);
    return saved;
  }

  async findSpawnedByMap(mapId: number): Promise<WorldItem[]> {
    return this.worldItems.find({
      where: { mapId, state: WorldItemState.SPAWNED },
      relations: ['item'],
      order: { createdAt: 'ASC' },
    });
  }

  async pickupItem(input: PickupWorldItemInput): Promise<Inventory> {
    this.assertFinitePosition(input.worldX, input.worldY, input.mapId);

    const picked = await this.dataSource.transaction(async (manager) => {
      const worldItem = await this.findSpawnedForUpdate(manager, input.worldItemId);
      if (!worldItem) {
        throw new NotFoundException('WorldItem not found');
      }

      if (worldItem.mapId !== input.mapId) {
        throw new BadRequestException('WorldItem is on another map');
      }

      if (worldItem.ownerCharacterId && worldItem.ownerCharacterId !== input.characterId) {
        throw new BadRequestException('This item belongs to another player');
      }

      if (worldItem.expiresAt && worldItem.expiresAt.getTime() <= Date.now()) {
        worldItem.state = WorldItemState.EXPIRED;
        await manager.save(WorldItem, worldItem);
        throw new BadRequestException('WorldItem has expired');
      }

      const distance = chebyshevDistanceWU(
        { worldX: input.worldX, worldY: input.worldY },
        { worldX: worldItem.worldX, worldY: worldItem.worldY },
      );
      if (distance > WORLD_ITEM_PICKUP_RANGE_WU) {
        throw new BadRequestException('WorldItem is too far away');
      }

      const inventory = await this.addInventoryQuantity(manager, {
        characterId: input.characterId,
        item: worldItem.item,
        quantity: worldItem.quantity,
      });

      worldItem.state = WorldItemState.PICKED;
      await manager.save(WorldItem, worldItem);

      return { inventory, worldItem };
    });

    this.emitRemove(picked.worldItem);
    return picked.inventory;
  }

  async dropInventoryItem(input: DropInventoryItemInput): Promise<DropInventoryItemResult> {
    this.assertValidDropInput(input);

    const result = await this.dataSource.transaction(async (manager) => {
      const inventory = await this.findInventoryForUpdate(manager, input.characterId, input.itemId);
      if (!inventory) {
        throw new NotFoundException('Inventory item not found');
      }
      if (!inventory.item) {
        throw new NotFoundException('Item not found');
      }
      if (inventory.quantity < input.quantity) {
        throw new BadRequestException('Not enough inventory quantity');
      }

      const nextQuantity = inventory.quantity - input.quantity;
      if (nextQuantity <= 0) {
        await manager.remove(Inventory, inventory);
      } else {
        inventory.quantity = nextQuantity;
        await manager.save(Inventory, inventory);
      }

      const worldItem = manager.create(WorldItem, {
        item: inventory.item,
        itemId: inventory.item.id,
        quantity: input.quantity,
        worldX: Math.round(input.worldX),
        worldY: Math.round(input.worldY),
        mapId: Math.round(input.mapId),
        ownerCharacterId: input.characterId,
        expiresAt: null,
        state: WorldItemState.SPAWNED,
      });
      const saved = await manager.save(WorldItem, worldItem);
      saved.item = inventory.item;

      return { inventoryQuantity: Math.max(nextQuantity, 0), worldItem: saved };
    });

    this.emitSpawn(result.worldItem);
    return result;
  }

  async removeExpiredItems(now = new Date()): Promise<WorldItem[]> {
    const expired = await this.worldItems.find({
      where: {
        state: WorldItemState.SPAWNED,
        expiresAt: LessThanOrEqual(now),
      },
      relations: ['item'],
    });

    for (const worldItem of expired) {
      worldItem.state = WorldItemState.EXPIRED;
    }

    const saved = expired.length > 0 ? await this.worldItems.save(expired) : [];
    for (const worldItem of saved) {
      this.emitRemove(worldItem);
    }
    return saved;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async resolveItem(itemRef: string): Promise<Item | null> {
    if (this.isUuid(itemRef)) {
      const item = await this.items.findOneBy({ id: itemRef });
      if (item) return item;
    }
    const material = await this.items.findOne({ where: { category: itemRef, type: 'material' } });
    if (material) return material;
    return this.items.findOne({ where: [{ type: itemRef }, { category: itemRef }] });
  }

  toDto(worldItem: WorldItem): WorldItemDto {
    return {
      id: worldItem.id,
      itemId: worldItem.itemId,
      quantity: worldItem.quantity,
      itemInstanceId: worldItem.itemInstanceId ?? null,
      worldX: worldItem.worldX,
      worldY: worldItem.worldY,
      mapId: worldItem.mapId,
      ownerCharacterId: worldItem.ownerCharacterId ?? null,
      createdAt: worldItem.createdAt,
      expiresAt: worldItem.expiresAt ?? null,
      state: worldItem.state,
      item: worldItem.item
        ? {
            id: worldItem.item.id,
            name: worldItem.item.name,
            type: worldItem.item.type,
            category: worldItem.item.category,
            image: worldItem.item.image ?? null,
          }
        : null,
    };
  }

  private async findSpawnedForUpdate(
    manager: EntityManager,
    worldItemId: string,
  ): Promise<WorldItem | null> {
    return manager
      .getRepository(WorldItem)
      .createQueryBuilder('worldItem')
      .innerJoinAndSelect('worldItem.item', 'item')
      .setLock('pessimistic_write')
      .where('worldItem.id = :id', { id: worldItemId })
      .andWhere('worldItem.state = :state', { state: WorldItemState.SPAWNED })
      .getOne();
  }

  private async addInventoryQuantity(
    manager: EntityManager,
    input: { characterId: string; item: Item; quantity: number },
  ): Promise<Inventory> {
    const character = await manager.findOne(Character, {
      where: { id: input.characterId },
    });
    if (!character) {
      throw new NotFoundException('Character not found');
    }

    const existing = await manager.findOne(Inventory, {
      where: {
        character: { id: character.id },
        item: { id: input.item.id },
      },
      relations: ['character', 'item'],
    });

    if (existing) {
      existing.quantity += input.quantity;
      return manager.save(Inventory, existing);
    }

    const inventory = manager.create(Inventory, {
      character,
      item: input.item,
      quantity: input.quantity,
      equipped: false,
    });
    return manager.save(Inventory, inventory);
  }

  private async findInventoryForUpdate(
    manager: EntityManager,
    characterId: string,
    itemId: string,
  ): Promise<Inventory | null> {
    return manager
      .getRepository(Inventory)
      .createQueryBuilder('inventory')
      .innerJoinAndSelect('inventory.item', 'item')
      .innerJoin('inventory.character', 'character')
      .setLock('pessimistic_write')
      .where('character.id = :characterId', { characterId })
      .andWhere('item.id = :itemId', { itemId })
      .andWhere('inventory.equipped = false')
      .getOne();
  }

  private assertValidSpawnInput(input: SpawnWorldItemInput) {
    if (!input.itemId) {
      throw new BadRequestException('itemId is required');
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new BadRequestException('quantity must be >= 1');
    }
    this.assertFinitePosition(input.worldX, input.worldY, input.mapId);
  }

  private assertValidDropInput(input: DropInventoryItemInput) {
    if (!input.characterId) {
      throw new BadRequestException('characterId is required');
    }
    if (!input.itemId) {
      throw new BadRequestException('itemId is required');
    }
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    this.assertFinitePosition(input.worldX, input.worldY, input.mapId);
  }

  private assertFinitePosition(worldX: number, worldY: number, mapId: number) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || !Number.isFinite(mapId)) {
      throw new BadRequestException('Invalid world position');
    }
  }

  private emitSpawn(worldItem: WorldItem) {
    this.server
      ?.to(getMapRoomId(worldItem.mapId))
      .emit('world_item_spawn', this.toDto(worldItem));
  }

  private emitRemove(worldItem: WorldItem) {
    this.server
      ?.to(getMapRoomId(worldItem.mapId))
      .emit('world_item_remove', {
        id: worldItem.id,
        mapId: worldItem.mapId,
        state: worldItem.state,
      });
  }
}
