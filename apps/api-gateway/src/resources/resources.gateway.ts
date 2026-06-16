// apps/api-gateway/src/resources/resources.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { WorldSocket } from '../types/world-socket';
import { ResourcesService } from './resources.service';
import { LootService } from '../world/loot.service';
import { InventoryService } from '../inventory/inventory.service';
import { WsAuthService } from '../common/ws-auth.service';

interface InteractResourcePayload {
  targetId: string;
}

@WebSocketGateway({ cors: true })
export class ResourcesGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly resources: ResourcesService,
    private readonly loot: LootService,
    private readonly inventory: InventoryService,
    private readonly wsAuthService: WsAuthService,
  ) {}

  async handleConnection(client: WorldSocket) {
    const auth = await this.wsAuthService.authenticate(client);
    if (!auth) {
      client.disconnect(true);
      return;
    }

    client.data.userId = auth.userId;

    await this.sendResources(client);
  }

  @SubscribeMessage('get_resources')
  async onGetResources(@ConnectedSocket() client: WorldSocket) {
    await this.sendResources(client);
  }

  @SubscribeMessage('interact_resource')
  async onInteract(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: InteractResourcePayload,
  ) {
    console.log('🔥 SERVER RECEIVED interact_resource:', payload);

    // Validation type-safe
    if (!payload || typeof payload.targetId !== 'string') {
      console.warn('❌ Invalid payload received:', payload);
      return;
    }

    // Le personnage est celui de la session ayant rejoint le monde
    // (join_world), jamais celui fourni par le client dans ce payload.
    const characterId = client.data.player?.characterId;
    if (!characterId) {
      console.warn('❌ No joined player for this socket:', client.id);
      return;
    }

    const targetId = payload.targetId;

    // 🔍 Récupération de la ressource
    const resource = await this.resources.findOne(targetId);
    if (!resource) {
      console.warn('❌ Resource not found:', targetId);
      return;
    }

    if (resource.state === 'dead' || (resource.remainingLoots ?? 0) <= 0) {
      console.warn('❌ Resource already depleted:', targetId);
      return;
    }

    // 🎁 Génère le loot
    const loot = this.loot.generateLoot(resource.type);
    if (loot.quantity <= 0) {
      console.warn('❌ No loot generated for resource:', resource.type);
      return;
    }

    const inventoryEntry = await this.inventory.addItem({
      characterId,
      itemId: loot.itemId,
      quantity: loot.quantity,
    });

    // 🪓 Consomme une charge de récolte
    const updatedResource = await this.resources.consumeLoot(targetId);
    if (!updatedResource) {
      console.warn('❌ Resource not found while consuming loot:', targetId);
      return;
    }

    // 📤 Envoie le loot au client
    client.emit('resource_loot', {
      itemId: inventoryEntry.item.id,
      lootItemId: loot.itemId,
      quantity: loot.quantity,
      total: inventoryEntry.quantity,
      item: {
        id: inventoryEntry.item.id,
        name: inventoryEntry.item.name,
        image: inventoryEntry.item.image,
      },
    });

    // 🔄 Mise à jour visuelle pour tous
    this.server.emit('resource_update', {
      id: targetId,
      state: updatedResource.state,
      remainingLoots: updatedResource.remainingLoots,
    });
  }

  private async sendResources(client: WorldSocket) {
    const objects = await this.resources.findAll();
    client.emit('resources', objects);
  }
}
