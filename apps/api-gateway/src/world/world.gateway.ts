// apps/api-gateway/src/world/world.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { WorldSocket } from '../types/world-socket';
import { WorldService } from './world.service';
import { WsAuthService } from '../common/ws-auth.service';
import { CLIENT_ORIGIN } from '../common/cors.constants';

type JoinWorldPayload = {
  characterId: string;
  name: string;
  sex?: string;
  x?: number;
  y?: number;
  direction?: string;
};

function isJoinWorldPayload(payload: unknown): payload is JoinWorldPayload {
  if (!payload || typeof payload !== 'object') return false;

  const candidate = payload as Record<string, unknown>;

  return (
    typeof candidate.characterId === 'string' &&
    typeof candidate.name === 'string'
  );
}

@WebSocketGateway({
  cors: {
    origin: CLIENT_ORIGIN,
  },
})
export class WorldGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly worldService: WorldService,
    private readonly wsAuthService: WsAuthService,
  ) {}

  /**
   * Rejette toute connexion sans JWT valide avant d'accepter le moindre
   * événement (join_world, gather, etc.).
   */
  async handleConnection(client: WorldSocket) {
    const auth = await this.wsAuthService.authenticate(client);
    if (!auth) {
      client.disconnect(true);
      return;
    }

    client.data.userId = auth.userId;
  }

  /**
   * Un personnage entre dans le monde.
   */
  @SubscribeMessage('join_world')
  async handleJoinWorld(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody()
    payload: unknown,
  ) {
    if (!isJoinWorldPayload(payload)) {
      client.emit('join_world_error', 'Invalid player payload');
      return;
    }

    const joined = await this.worldService.joinPlayer(client, payload);
    if (!joined) {
      client.emit('join_world_error', 'Character not found');
      return;
    }

    const { player, previousSocketId } = joined;

    if (previousSocketId) {
      this.server.emit('player_left', {
        socketId: previousSocketId,
        characterId: player.characterId,
      });
    }

    client.emit(
      'current_players',
      this.worldService.getPlayersExcept(client.id),
    );
    client.emit('world_joined', player);
    client.broadcast.emit('player_joined', player);
  }

  /**
   * Position du joueur local, diffusée aux autres clients.
   */
  @SubscribeMessage('player_move')
  handlePlayerMove(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { x: number; y: number; direction?: string },
  ) {
    if (
      !payload ||
      typeof payload.x !== 'number' ||
      typeof payload.y !== 'number'
    ) {
      return;
    }

    const player = this.worldService.updatePlayer(client, payload);
    if (!player) return;

    client.broadcast.emit('player_moved', player);
  }

  async handleDisconnect(client: WorldSocket) {
    const player = this.worldService.removePlayer(client);
    if (player) {
      await this.worldService.persistPlayerPosition(player);
      client.broadcast.emit('player_left', {
        socketId: player.socketId,
        characterId: player.characterId,
      });
    }
  }
}
