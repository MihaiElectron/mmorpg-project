import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { BadRequestException } from '@nestjs/common';
import { DEFAULT_MAP_ID } from '../common/world-coordinates';
import { CLIENT_ORIGIN } from '../common/cors.constants';
import { WsAuthService } from '../common/ws-auth.service';
import type { WorldSocket } from '../types/world-socket';
import { WorldItemService } from './world-item.service';

type DropInventoryItemPayload = {
  inventoryEntryId?: string;
  quantity?: number;
};

type PickupWorldItemPayload = {
  worldItemId?: string;
};

@WebSocketGateway({ cors: { origin: CLIENT_ORIGIN } })
export class WorldItemsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly worldItems: WorldItemService,
    private readonly wsAuthService: WsAuthService,
  ) {}

  afterInit(server: Server) {
    this.worldItems.setServer(server);
  }

  async handleConnection(client: WorldSocket) {
    const auth = await this.wsAuthService.authenticate(client);
    if (!auth) {
      client.disconnect(true);
      return;
    }

    client.data.userId = auth.userId;
    client.data.role = auth.role;
  }

  @SubscribeMessage('get_world_items')
  async onGetWorldItems(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload?: { mapId?: number },
  ) {
    const mapId = Number.isFinite(payload?.mapId)
      ? Number(payload?.mapId)
      : client.data.player?.mapId ?? DEFAULT_MAP_ID;
    const items = await this.worldItems.findSpawnedByMap(mapId);
    client.emit('world_items', items.map((item) => this.worldItems.toDto(item)));
  }

  @SubscribeMessage('drop_inventory_item')
  async onDropInventoryItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: DropInventoryItemPayload,
  ) {
    try {
      const player = client.data.player;
      if (!player?.characterId) {
        throw new BadRequestException('Character must join world before dropping items');
      }
      if (!payload || typeof payload.inventoryEntryId !== 'string') {
        throw new BadRequestException('inventoryEntryId is required');
      }
      const quantity = Number(payload.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new BadRequestException('quantity must be a positive integer');
      }

      const result = await this.worldItems.dropInventoryItem({
        characterId: player.characterId,
        inventoryEntryId: payload.inventoryEntryId,
        quantity,
        worldX: player.worldX,
        worldY: player.worldY,
        mapId: player.mapId ?? DEFAULT_MAP_ID,
      });

      client.emit('inventory_update', {
        itemId: result.worldItem.itemId,
        total: result.inventoryQuantity,
        item: result.worldItem.item
          ? this.worldItems.toDto(result.worldItem).item
          : null,
      });

      return {
        success: true,
        worldItem: this.worldItems.toDto(result.worldItem),
        inventoryQuantity: result.inventoryQuantity,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Drop failed',
      };
    }
  }

  @SubscribeMessage('pickup_world_item')
  async onPickupWorldItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: PickupWorldItemPayload,
  ) {
    try {
      const player = client.data.player;
      if (!player?.characterId) {
        throw new BadRequestException('Character must join world before picking up items');
      }
      if (!payload || typeof payload.worldItemId !== 'string') {
        throw new BadRequestException('worldItemId is required');
      }

      const inventory = await this.worldItems.pickupItem({
        worldItemId: payload.worldItemId,
        characterId: player.characterId,
        worldX: player.worldX,
        worldY: player.worldY,
        mapId: player.mapId ?? DEFAULT_MAP_ID,
      });

      client.emit('inventory_update', {
        itemId: inventory.item.id,
        total: inventory.quantity,
        item: {
          id: inventory.item.id,
          name: inventory.item.name,
          type: inventory.item.type,
          category: inventory.item.category,
          image: inventory.item.image ?? null,
        },
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Pickup failed',
      };
    }
  }
}
