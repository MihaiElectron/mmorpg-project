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
import { LootService } from '../world/loot.service';

interface InteractResourcePayload {
  targetId: string;
}

@WebSocketGateway({ cors: true })
export class ResourcesGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly resources: ResourcesService,
    private readonly loot: LootService,
  ) {}

  async handleConnection(client: Socket) {
    console.log('🔥 Client connected:', client.id);

    const objects = await this.resources.findAll();
    client.emit('resources', objects);
  }

  @SubscribeMessage('interact_resource')
  async onInteract(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: InteractResourcePayload,
  ) {
    console.log('🔥 SERVER RECEIVED interact_resource:', payload);

    // Validation type-safe
    if (!payload || typeof payload.targetId !== 'string') {
      console.warn('❌ Invalid payload received:', payload);
      return;
    }

    const targetId = payload.targetId;

    // 🔍 Récupération de la ressource
    const resource = await this.resources.findOne(targetId);
    if (!resource) {
      console.warn('❌ Resource not found:', targetId);
      return;
    }

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
