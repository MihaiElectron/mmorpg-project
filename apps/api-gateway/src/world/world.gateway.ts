// apps/api-gateway/src/world/world.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { WorldSocket } from '../types/world-socket';
import { WorldService, ConnectedPlayer } from './world.service';
import { WsAuthService } from '../common/ws-auth.service';
import { CLIENT_ORIGIN } from '../common/cors.constants';
import { getMapRoomId } from '../common/socket-rooms';

function playerBroadcast(p: ConnectedPlayer) {
  return {
    socketId:    p.socketId,
    characterId: p.characterId,
    name:        p.name,
    sex:         p.sex,
    worldX:      p.worldX,
    worldY:      p.worldY,
    mapId:       p.mapId,
    direction:   p.direction,
  };
}

type JoinWorldPayload = {
  characterId: string;
  name: string;
  sex?: string;
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
export class WorldGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly worldService: WorldService,
    private readonly wsAuthService: WsAuthService,
  ) {}

  /** Expose le serveur Socket.IO au WorldService (émission character:reload HTTP). */
  afterInit(server: Server) {
    this.worldService.registerServer(server);
  }

  /**
   * Rejette toute connexion sans JWT valide avant d'accepter le moindre
   * événement (join_world, gather, etc.).
   */
  async handleConnection(client: WorldSocket) {
    // Multiple gateways share the default namespace and each registers internal
    // disconnect listeners — raise the limit to silence the false-positive warning.
    client.setMaxListeners(20);

    const auth = await this.wsAuthService.authenticate(client);
    if (!auth) {
      client.disconnect(true);
      return;
    }

    client.data.userId = auth.userId;
    client.data.role = auth.role;
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
    const mapRoom = getMapRoomId(player.mapId);

    client.join(mapRoom);

    if (previousSocketId) {
      this.server.to(mapRoom).emit('player_left', {
        socketId: previousSocketId,
        characterId: player.characterId,
      });
    }

    client.emit(
      'current_players',
      this.worldService.getPlayersExcept(client.id, player.mapId).map(playerBroadcast),
    );
    client.emit('world_joined', playerBroadcast(player));
    // Sync ressources courantes + max dérivés au seul lanceur après le
    // refill/clamp du join (Skills V1-J-C) : l'UI reflète energy/mana sans F5.
    client.emit('character_resource_update', joined.resources);
    client.broadcast.to(mapRoom).emit('player_joined', playerBroadcast(player));
  }

  /**
   * Position du joueur local, diffusée aux autres clients.
   * Payload WU-only depuis P5 : { worldX, worldY, mapId, direction? }.
   */
  @SubscribeMessage('player_move')
  handlePlayerMove(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { worldX: number; worldY: number; mapId: number; direction?: string },
  ) {
    if (!payload) return;

    // M4 Phase A : le serveur valide la proposition (payload invalide, spam,
    // mapId, distance/vitesse) — voir WorldService.updatePlayer.
    const result = this.worldService.updatePlayer(client, payload);
    if (!result) return;

    if (result.status === 'rejected') {
      // Correction émise UNIQUEMENT au client fautif, jamais broadcastée.
      // rate_limit : drop silencieux (pas d'amplification spam → corrections).
      if (result.reason !== 'rate_limit') {
        client.emit('player_position_correction', {
          worldX: result.player.worldX,
          worldY: result.player.worldY,
          mapId: result.player.mapId,
          reason: result.reason,
          serverTime: Date.now(),
        });
      }
      return;
    }

    const player = result.player;
    client.broadcast.to(getMapRoomId(player.mapId)).emit('player_moved', playerBroadcast(player));
  }

  async handleDisconnect(client: WorldSocket) {
    const player = this.worldService.removePlayer(client);
    if (player) {
      await this.worldService.persistPlayerPosition(player);
      client.broadcast.to(getMapRoomId(player.mapId)).emit('player_left', {
        socketId: player.socketId,
        characterId: player.characterId,
      });
    }
  }
}
