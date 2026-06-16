import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AnimalsService } from './animals.service';

@WebSocketGateway({ cors: true })
export class AnimalsGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly animalsService: AnimalsService) {}

  async handleConnection(client: Socket) {
    await this.sendAnimals(client);
  }

  @SubscribeMessage('get_animals')
  async onGetAnimals(@ConnectedSocket() client: Socket) {
    await this.sendAnimals(client);
  }

  @SubscribeMessage('attack_animal')
  async onAttackAnimal(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetId: string; characterId: string },
  ) {
    if (
      !payload ||
      typeof payload.targetId !== 'string' ||
      typeof payload.characterId !== 'string'
    ) {
      return;
    }

    const animal = await this.animalsService.attack(
      payload.targetId,
      payload.characterId,
    );
    if (!animal) return;

    client.emit('animal_hit', animal);
    this.server.emit('animal_update', animal);
  }

  private async sendAnimals(client: Socket) {
    const animals = await this.animalsService.findAll();
    client.emit('animals', animals);
  }
}
