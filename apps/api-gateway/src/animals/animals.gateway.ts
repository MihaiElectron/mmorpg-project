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
import { AnimalsService, isAttackFailure } from './animals.service';
import { WsAuthService } from '../common/ws-auth.service';
import { CLIENT_ORIGIN } from '../common/cors.constants';

@WebSocketGateway({ cors: { origin: CLIENT_ORIGIN } })
export class AnimalsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly animalsService: AnimalsService,
    private readonly wsAuthService: WsAuthService,
  ) {}

  afterInit(server: Server) {
    this.animalsService.startPatrol(server);
  }

  async handleConnection(client: WorldSocket) {
    const auth = await this.wsAuthService.authenticate(client);
    if (!auth) {
      client.disconnect(true);
      return;
    }
    client.data.userId = auth.userId;
    client.data.role = auth.role;
    client.emit('animals', this.animalsService.findAll());
  }

  @SubscribeMessage('get_animals')
  onGetAnimals(@ConnectedSocket() client: WorldSocket) {
    client.emit('animals', this.animalsService.findAll());
  }

  @SubscribeMessage('attack_animal')
  async onAttackAnimal(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { targetId: string },
  ) {
    if (!payload || typeof payload.targetId !== 'string') return;

    const player = client.data.player;
    if (!player?.characterId) {
      console.warn('No joined player for this socket:', client.id);
      return;
    }

    const result = await this.animalsService.attack(
      payload.targetId,
      player.characterId,
      { worldX: player.worldX, worldY: player.worldY, mapId: player.mapId },
    );

    if (isAttackFailure(result)) {
      console.warn('Attack rejected:', result.error);
      return;
    }

    client.emit('animal_hit', { ...result.dto, damage: result.damage, attackerId: result.attackerId });
    this.server.emit('animal_update', result.dto);

    if (result.riposte) {
      client.emit('character_damaged', {
        characterId: player.characterId,
        damage: result.riposte.damage,
        health: result.riposte.characterHealth,
      });
    }
  }
}
