// apps/api-gateway/src/world/world.gateway.ts

import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type { WorldSocket } from '../types/world-socket';
import { WorldService } from './world.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WorldGateway {
  constructor(private readonly worldService: WorldService) {}

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
