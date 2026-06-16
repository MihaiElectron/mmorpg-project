import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
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
export class AnimalsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly animalsService: AnimalsService,
    private readonly wsAuthService: WsAuthService,
  ) {}

  async handleConnection(client: WorldSocket) {
    const auth = await this.wsAuthService.authenticate(client);
    if (!auth) {
      client.disconnect(true);
      return;
    }

    client.data.userId = auth.userId;

    await this.sendAnimals(client);
  }

  @SubscribeMessage('get_animals')
  async onGetAnimals(@ConnectedSocket() client: WorldSocket) {
    await this.sendAnimals(client);
  }

  @SubscribeMessage('attack_animal')
  async onAttackAnimal(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { targetId: string },
  ) {
    if (!payload || typeof payload.targetId !== 'string') {
      return;
    }

    // Le personnage (et sa position) sont ceux de la session ayant rejoint
    // le monde (join_world), jamais ceux fournis par le client dans ce payload.
    const player = client.data.player;
    if (!player?.characterId) {
      console.warn('No joined player for this socket:', client.id);
      return;
    }

    const result = await this.animalsService.attack(
      payload.targetId,
      player.characterId,
      { x: player.x, y: player.y },
    );

    if (isAttackFailure(result)) {
      console.warn('Attack rejected:', result.error);
      return;
    }

    client.emit('animal_hit', {
      ...result.animal,
      damage: result.damage,
      attackerId: result.attackerId,
    });
    this.server.emit('animal_update', result.animal);

    if (result.riposte) {
      client.emit('character_damaged', {
        characterId: player.characterId,
        damage: result.riposte.damage,
        health: result.riposte.characterHealth,
      });
    }
  }

  private async sendAnimals(client: WorldSocket) {
    const animals = await this.animalsService.findAll();
    client.emit('animals', animals);
  }
}
