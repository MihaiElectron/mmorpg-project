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
import type { WorldSocket } from '../types/world-socket';
import { CreaturesService, isAttackFailure } from './creatures.service';
import { WsAuthService } from '../common/ws-auth.service';
import { CLIENT_ORIGIN } from '../common/cors.constants';

@WebSocketGateway({ cors: { origin: CLIENT_ORIGIN } })
export class CreaturesGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly creaturesService: CreaturesService,
    private readonly wsAuthService: WsAuthService,
  ) {}

  afterInit(server: Server) {
    this.creaturesService.startPatrol(server);
  }

  async handleConnection(client: WorldSocket) {
    const auth = await this.wsAuthService.authenticate(client);
    if (!auth) {
      client.disconnect(true);
      return;
    }
    client.data.userId = auth.userId;
    client.data.role = auth.role;
    client.emit('creatures', this.creaturesService.findAll());
  }

  @SubscribeMessage('get_creatures')
  onGetCreatures(@ConnectedSocket() client: WorldSocket) {
    client.emit('creatures', this.creaturesService.findAll());
  }

  @SubscribeMessage('attack_creature')
  async onAttackCreature(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { targetId: string },
  ) {
    if (!payload || typeof payload.targetId !== 'string') return;

    const player = client.data.player;
    if (!player?.characterId) {
      console.warn('No joined player for this socket:', client.id);
      return;
    }

    const result = await this.creaturesService.attack(
      payload.targetId,
      player.characterId,
      { worldX: player.worldX, worldY: player.worldY, mapId: player.mapId },
    );

    if (isAttackFailure(result)) {
      console.warn('Attack rejected:', result.error);
      return;
    }

    client.emit('creature_hit', { ...result.dto, damage: result.damage, attackerId: result.attackerId });
    this.server.emit('creature_update', result.dto);

    if (result.riposte) {
      client.emit('character_damaged', {
        characterId: player.characterId,
        damage: result.riposte.damage,
        health: result.riposte.characterHealth,
      });
    }
  }
}
