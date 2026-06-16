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
import { AnimalsService } from './animals.service';
import { WsAuthService } from '../common/ws-auth.service';

@WebSocketGateway({ cors: true })
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

    // Le personnage est celui de la session ayant rejoint le monde
    // (join_world), jamais celui fourni par le client dans ce payload.
    const characterId = client.data.player?.characterId;
    if (!characterId) {
      console.warn('❌ No joined player for this socket:', client.id);
      return;
    }

    const animal = await this.animalsService.attack(
      payload.targetId,
      characterId,
    );
    if (!animal) return;

    client.emit('animal_hit', animal);
    this.server.emit('animal_update', animal);
  }

  private async sendAnimals(client: WorldSocket) {
    const animals = await this.animalsService.findAll();
    client.emit('animals', animals);
  }
}
