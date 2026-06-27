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
import { DEFAULT_MAP_ID } from '../common/world-coordinates';
import { CLIENT_ORIGIN } from '../common/cors.constants';
import { WsAuthService } from '../common/ws-auth.service';
import type { WorldSocket } from '../types/world-socket';
import { WorldItemService } from './world-item.service';

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
}
