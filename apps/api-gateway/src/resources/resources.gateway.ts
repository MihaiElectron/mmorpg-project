// apps/api-gateway/src/resources/resources.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { WorldSocket } from '../types/world-socket';
import { ResourcesService } from './resources.service';
import { LootService } from '../world/loot.service';
import { InventoryService } from '../inventory/inventory.service';
import { Inventory } from '../inventory/entities/inventory.entity';
import { SkillsService } from '../skills/skills.service';
import { WsAuthService } from '../common/ws-auth.service';
import { CLIENT_ORIGIN } from '../common/cors.constants';
import { WUPositionRecord } from '../common/world-position.adapter';
import { chebyshevDistanceWU, DEFAULT_MAP_ID } from '../common/world-coordinates';
import { getMapRoomId } from '../common/socket-rooms';

interface InteractResourcePayload {
  targetId: string;
}

// Portée de récolte en WU — temporaire, à recalibrer (≈ 100 px legacy).
const RESOURCE_INTERACT_RANGE_WU = 1600;

// Intervalle entre deux loots d'un cycle de récolte continue.
const GATHER_INTERVAL_MS = 3000;

// Tolérance de déplacement (WU) avant de considérer que le joueur a bougé.
// ≈ 128 WU = ~4 pixels isométriques (1 tile = 1024 WU, 1 nav cell = 128 WU).
const MOVE_TOLERANCE_WU = 128;

type GatherSession = {
  targetId: string;
  timer: NodeJS.Timeout;
  lastWorldX: number;
  lastWorldY: number;
};

@WebSocketGateway({ cors: { origin: CLIENT_ORIGIN } })
export class ResourcesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  afterInit(server: Server) {
    this.resources.setServer(server);
  }

  /**
   * Cycle de récolte continue en cours, indexé par socket.id.
   */
  private readonly gatherSessions = new Map<string, GatherSession>();

  constructor(
    private readonly resources: ResourcesService,
    private readonly loot: LootService,
    private readonly inventory: InventoryService,
    private readonly wsAuthService: WsAuthService,
    private readonly skills: SkillsService,
  ) {}

  async handleConnection(client: WorldSocket) {
    const auth = await this.wsAuthService.authenticate(client);
    if (!auth) {
      client.disconnect(true);
      return;
    }

    client.data.userId = auth.userId;
    client.data.role = auth.role;

    await this.sendResources(client);
  }

  handleDisconnect(client: WorldSocket) {
    this.clearSession(client.id);
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
    if (!payload || typeof payload.targetId !== 'string') {
      console.warn('Invalid payload received:', payload);
      return;
    }

    // Le personnage (et sa position) sont ceux de la session ayant rejoint
    // le monde (join_world), jamais ceux fournis par le client.
    const player = client.data.player;
    if (!player?.characterId) {
      console.warn('No joined player for this socket:', client.id);
      return;
    }

    const targetId = payload.targetId;

    const existing = this.gatherSessions.get(client.id);
    if (existing) {
      if (existing.targetId === targetId) {
        // Déjà en train de récolter cette ressource : on ignore le re-clic.
        return;
      }
      this.cancelGathering(client, existing.targetId, 'switched');
    }

    const resource = await this.resources.findOne(targetId);
    if (!resource) {
      console.warn('Resource not found:', targetId);
      return;
    }

    if (resource.state === 'dead' || (resource.remainingLoots ?? 0) <= 0) {
      console.warn('Resource already depleted:', targetId);
      return;
    }

    if (!this.isInRange(player, resource)) {
      console.warn('Too far from resource:', targetId);
      return;
    }

    this.startGatherCycle(client, targetId, player.worldX, player.worldY);
  }

  /**
   * Démarre (ou relance) un cycle de récolte : émet un tick pour le feedback
   * visuel client, puis arme le prochain loot dans GATHER_INTERVAL_MS.
   */
  private startGatherCycle(
    client: WorldSocket,
    targetId: string,
    worldX: number,
    worldY: number,
  ) {
    client.emit('gather_tick', { targetId, duration: GATHER_INTERVAL_MS });

    const timer = setTimeout(() => {
      void this.runGatherCycle(client, targetId);
    }, GATHER_INTERVAL_MS);

    this.gatherSessions.set(client.id, { targetId, timer, lastWorldX: worldX, lastWorldY: worldY });
  }

  /**
   * Un cycle de récolte : revalide tout (mouvement, portée, état de la
   * ressource) avant d'accorder le loot, puis relance le cycle suivant.
   */
  private async runGatherCycle(client: WorldSocket, targetId: string) {
    const session = this.gatherSessions.get(client.id);
    if (!session || session.targetId !== targetId) return;

    if (!client.connected) {
      this.clearSession(client.id);
      return;
    }

    const player = client.data.player;
    if (!player?.characterId) {
      this.cancelGathering(client, targetId, 'error');
      return;
    }

    const moved =
      Math.abs(player.worldX - session.lastWorldX) > MOVE_TOLERANCE_WU ||
      Math.abs(player.worldY - session.lastWorldY) > MOVE_TOLERANCE_WU;
    if (moved) {
      this.cancelGathering(client, targetId, 'moved');
      return;
    }

    const resource = await this.resources.findOne(targetId);
    if (
      !resource ||
      resource.state === 'dead' ||
      (resource.remainingLoots ?? 0) <= 0
    ) {
      this.cancelGathering(client, targetId, 'depleted');
      return;
    }

    if (!this.isInRange(player, resource)) {
      this.cancelGathering(client, targetId, 'out_of_range');
      return;
    }

    const characterId = player.characterId;

    const template = await this.resources.getTemplate(resource.type);
    const loot = this.loot.generateLoot(resource.type, template?.lootPool ?? null);
    if (loot.quantity <= 0) {
      this.cancelGathering(client, targetId, 'error');
      return;
    }

    let inventoryEntry: Inventory;
    try {
      inventoryEntry = await this.inventory.addItem({
        characterId,
        itemId: loot.itemId,
        quantity: loot.quantity,
      });
    } catch {
      this.cancelGathering(client, targetId, 'error');
      return;
    }

    const updatedResource = await this.resources.consumeLoot(targetId);
    if (!updatedResource) {
      this.cancelGathering(client, targetId, 'error');
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

    // 🔄 Mise à jour visuelle pour les joueurs de la même map
    const mapId = (updatedResource as any).mapId ?? DEFAULT_MAP_ID;
    this.server.to(getMapRoomId(mapId)).emit('resource_update', this.resources.buildResourceBroadcast(updatedResource as any, template?.textureKey));

    // XP de récolte data-driven depuis ResourceTemplate.skillKey / gatheringXpReward.
    // characterId vient du serveur (client.data.player), jamais du client.
    // template est déjà chargé ci-dessus (ligne generateLoot).
    const xpSkillKey = template?.skillKey ?? null;
    const xpReward = template?.gatheringXpReward ?? 0;
    if (xpSkillKey && xpReward > 0) {
      try {
        await this.skills.addXp(characterId, xpSkillKey, xpReward);
      } catch (err) {
        console.warn(`[ResourcesGateway] XP récolte ignorée pour ${characterId}: ${(err as Error).message}`);
      }
    }

    if (updatedResource.state === 'dead') {
      await this.resources.scheduleRespawn(updatedResource.id);
      this.cancelGathering(client, targetId, 'depleted');
      return;
    }

    this.startGatherCycle(client, targetId, player.worldX, player.worldY);
  }

  private isInRange(
    player: { worldX: number; worldY: number; mapId: number },
    target: WUPositionRecord,
  ): boolean {
    if (target.worldX == null || target.worldY == null || target.mapId == null) return false;
    if (target.mapId !== player.mapId) return false;
    return chebyshevDistanceWU(
      { worldX: player.worldX, worldY: player.worldY },
      { worldX: target.worldX, worldY: target.worldY },
    ) <= RESOURCE_INTERACT_RANGE_WU;
  }

  private cancelGathering(
    client: WorldSocket,
    targetId: string,
    reason: string,
  ) {
    this.clearSession(client.id);
    client.emit('gather_stopped', { targetId, reason });
  }

  private clearSession(socketId: string) {
    const session = this.gatherSessions.get(socketId);
    if (!session) return;

    clearTimeout(session.timer);
    this.gatherSessions.delete(socketId);
  }

  private async sendResources(client: WorldSocket) {
    const objects = await this.resources.findAllWithTextureKey();
    client.emit('resources', objects);
  }
}
