// apps/api-gateway/src/world/world.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { WorldSocket } from '../types/world-socket';
import { WorldService } from './world.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WorldGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly worldService: WorldService) {}

  /**
   * Un personnage entre dans le monde.
   */
  @SubscribeMessage('join_world')
  handleJoinWorld(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody()
    payload: {
      characterId: string;
      name: string;
      sex?: string;
      x?: number;
      y?: number;
      direction?: string;
    },
  ) {
    if (!payload?.characterId || !payload?.name) {
      client.emit('join_world_error', 'Invalid player payload');
      return;
    }

    const { player, previousSocketId } = this.worldService.joinPlayer(
      client,
      payload,
    );

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

  handleDisconnect(client: WorldSocket) {
    const player = this.worldService.removePlayer(client);
    if (player) {
      client.broadcast.emit('player_left', {
        socketId: player.socketId,
        characterId: player.characterId,
      });
    }
  }

  /**
   * Le joueur clique sur un objet → vérification distance → ouverture fenêtre
   */
  @SubscribeMessage('interact_object')
  handleInteractObject(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { targetId: string },
  ) {
    const result = this.worldService.checkInteraction(client, payload);

    if ('error' in result) {
      client.emit('interact_error', result.error);
      return;
    }

    client.emit('open_gather_window', {
      targetId: result.target.id,
      targetType: result.target.type,
    });
  }

  /**
   * Récolte simple (instantanée)
   */
  @SubscribeMessage('gather')
  async handleGather(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { targetId: string; targetType: string },
  ) {
    const result = await this.worldService.handleGather(client, payload);
    client.emit('gather_result', result);
  }

  /**
   * Démarre un gathering sécurisé (timer serveur)
   */
  @SubscribeMessage('start_gathering')
  handleStartGathering(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { targetId: string; targetType: string },
  ) {
    const result = this.worldService.startGathering(client, payload);
    client.emit('start_gathering_result', result);
  }

  /**
   * Arrête un gathering sécurisé
   */
  @SubscribeMessage('stop_gathering')
  handleStopGathering(@ConnectedSocket() client: WorldSocket) {
    this.worldService.stopGathering(client);
    client.emit('stop_gathering_result', { success: true });
  }
}
