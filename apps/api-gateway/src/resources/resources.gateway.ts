// apps/api-gateway/src/resources/resources.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ResourcesService } from './resources.service';
import { LootService } from '../world/loot.service'; // ✅ Ajout
import { plainToInstance } from 'class-transformer';

@WebSocketGateway({ cors: true })
export class ResourcesGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly resources: ResourcesService,
    private readonly loot: LootService, // ✅ Injection propre
  ) {}

  async handleConnection(client: Socket) {
    const objects = await this.resources.findAll();
    client.emit('resources', objects);
  }

  @SubscribeMessage('interact_resource')
  async onInteract(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ) {
    // Transforme unknown → objet simple
    const transformed = plainToInstance(
      Object as unknown as new () => { targetId: string },
      payload,
    );

    // Validation minimale
    if (
      typeof transformed !== 'object' ||
      transformed === null ||
      typeof transformed.targetId !== 'string'
    ) {
      return;
    }

    const targetId = transformed.targetId;

    // 🔍 Récupération de la ressource
    const resource = await this.resources.findOne(targetId);
    if (!resource) return;

    // 🪓 Marque comme récolté
    await this.resources.markGathered(targetId);

    // 🎁 Génère le loot
    const loot = this.loot.generateLoot(resource.type);

    // 📤 Envoie le loot au client
    client.emit('resource_loot', loot);

    // 🔄 Mise à jour visuelle pour tous
    this.server.emit('resource_update', {
      id: targetId,
      state: 'dead',
    });
  }
}
