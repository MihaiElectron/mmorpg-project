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
  itemId?: string;
  quantity?: number;
  worldX?: number;
  worldY?: number;
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
      if (!payload || typeof payload.itemId !== 'string') {
        throw new BadRequestException('itemId is required');
      }
      if (payload.quantity !== 1) {
        throw new BadRequestException('quantity must be exactly 1 for this phase');
      }

      const result = await this.worldItems.dropInventoryItem({
        characterId: player.characterId,
        itemId: payload.itemId,
        quantity: 1,
        worldX: Number(payload.worldX),
        worldY: Number(payload.worldY),
        mapId: player.mapId ?? DEFAULT_MAP_ID,
      });

      client.emit('inventory_update', {
        itemId: payload.itemId,
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
}
