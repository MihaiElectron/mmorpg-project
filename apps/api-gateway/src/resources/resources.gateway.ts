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
import { DataSource } from 'typeorm';
import type { WorldSocket } from '../types/world-socket';
import { ResourcesService } from './resources.service';
import { LootService } from '../world/loot.service';
import { MasteriesService } from '../masteries/masteries.service';
import type { MaterializationResult } from '../item-materialization/item-materialization.service';
import { WsAuthService } from '../common/ws-auth.service';
import { CLIENT_ORIGIN } from '../common/cors.constants';
import { WUPositionRecord } from '../common/world-position.adapter';
import { chebyshevDistanceWU, DEFAULT_MAP_ID } from '../common/world-coordinates';
import { getMapRoomId } from '../common/socket-rooms';
import { ItemMaterializationService } from '../item-materialization/item-materialization.service';
import { ItemInstanceSource } from '../item-instances/enums/item-instance-source.enum';
import { ProgressionService, ProgressionSource, CharacterXpResult } from '../progression/progression.service';
import { MasteryUpdatePayload } from '../masteries/masteries.service';
import { calculateMasteryXp } from '../mastery-xp-calculator/mastery-xp-calculator';
import { MasteryDomain, MasteryXpContext } from '../mastery-xp-calculator/mastery-xp-context';
import { Resource } from './entities/resource.entity';

interface InteractResourcePayload {
  targetId: string;
}

/**
 * Résolution runtime type de ressource → masteryDefinitionKey (Phase 2c).
 * Le mastery de récolte est déduit du type de la ressource, jamais d'un champ
 * du template. Temporaire : destiné à migrer vers une config Studio.
 */
const GATHERING_RESOURCE_MASTERY_MAP: Record<string, string> = {
  dead_tree: 'woodcutting',
  ore: 'mining',
};

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
    private readonly dataSource: DataSource,
    private readonly itemMaterialization: ItemMaterializationService,
    private readonly wsAuthService: WsAuthService,
    private readonly masteries: MasteriesService,
    private readonly progression: ProgressionService,
  ) {}

  /** Résout le mastery de récolte depuis le type de ressource (Runtime only). */
  private resolveGatherMasteryKey(resourceType: string): string | null {
    return GATHERING_RESOURCE_MASTERY_MAP[resourceType] ?? null;
  }

  private buildGatherMasteryXpContext(masteryKey: string, difficulty: number): MasteryXpContext {
    return {
      masteryDefinitionKey: masteryKey,
      domain: 'gathering' as MasteryDomain,
      action: 'gather',
      success: true,
      difficulty: Math.max(0, Math.min(100, difficulty)),
      quality: null,
      characterLevel: 1,
      masteryLevel: 1,
      duration: GATHER_INTERVAL_MS,
      damage: null,
      blockedDamage: null,
      healedAmount: null,
      buffs: [],
      debuffs: [],
    };
  }

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
      client.emit('interact_resource_error', { error: 'out_of_range', targetId });
      return;
    }

    this.startGatherCycle(client, targetId, player.worldX, player.worldY);
  }

  private startGatherCycle(
    client: WorldSocket,
    targetId: string,
    worldX: number,
    worldY: number,
  ) {
    const timer = setTimeout(async () => {
      await this.runGatherCycle(client, targetId);
    }, GATHER_INTERVAL_MS);

    this.gatherSessions.set(client.id, { targetId, timer, lastWorldX: worldX, lastWorldY: worldY });

    // Signalement UI (cercle de progression WorldScene) — purement cosmétique,
    // aucune logique runtime. La durée pilote l'animation de l'arc côté client.
    client.emit('gather_tick', { targetId, duration: GATHER_INTERVAL_MS });
  }

  private async runGatherCycle(client: WorldSocket, targetId: string) {
    const player = client.data.player;
    if (!player?.characterId) {
      this.clearSession(client.id);
      return;
    }

    const session = this.gatherSessions.get(client.id);
    if (!session || session.targetId !== targetId) return;

    const { lastWorldX, lastWorldY } = session;
    const dx = Math.abs(player.worldX - lastWorldX);
    const dy = Math.abs(player.worldY - lastWorldY);
    if (dx > MOVE_TOLERANCE_WU || dy > MOVE_TOLERANCE_WU) {
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
    const lootEntries = this.loot.generateLoot(resource.type, template?.lootPool ?? null);
    if (lootEntries.length === 0) {
      this.cancelGathering(client, targetId, 'error');
      return;
    }

    // Character XP vient du template ; Mastery XP vient du Runtime (type → context).
    // gatheringDifficulty (template) alimente MasteryXpContext.difficulty — jamais
    // une valeur d'XP mastery stockée (ADR-0016).
    const charXpReward = template?.gatherCharacterXpReward ?? 0;
    const gatheringDifficulty = template?.gatheringDifficulty ?? 0;
    const masteryKey = this.resolveGatherMasteryKey(resource.type);
    const masteryXpResult = masteryKey
      ? calculateMasteryXp(this.buildGatherMasteryXpContext(masteryKey, gatheringDifficulty))
      : null;

    // Pipeline transactionnel unique : loot + consumeLoot + Character XP + Mastery XP.
    // Tout ou rien : si une étape échoue, aucun loot, aucun décrément, aucune XP.
    let txOut: {
      matResult: MaterializationResult;
      updatedResource: Resource;
      characterXpUpdate?: CharacterXpResult;
      masteryUpdate?: MasteryUpdatePayload;
    };
    try {
      txOut = await this.dataSource.transaction(async (manager) => {
        const matResult = await this.itemMaterialization.materialize(manager, lootEntries, {
          source: ItemInstanceSource.LOOT,
          destination: { type: 'INVENTORY', characterId },
          ownerId: characterId,
        });
        // Le loot peut être STACKABLE (stacks) ou INSTANCE (instances) :
        // n'échouer que si rien n'a été matérialisé.
        if (matResult.stacks.length === 0 && matResult.instances.length === 0) {
          throw new Error('no_loot');
        }

        const updatedResource = await this.resources.consumeLootInManager(manager, targetId);
        if (!updatedResource) throw new Error('consume_failed');

        let characterXpUpdate: CharacterXpResult | undefined;
        if (charXpReward > 0) {
          characterXpUpdate = await this.progression.applyCharacterXpInTx(
            characterId, charXpReward, ProgressionSource.RESOURCE, manager,
          );
        }

        let masteryUpdate: MasteryUpdatePayload | undefined;
        if (masteryXpResult) {
          masteryUpdate = await this.masteries.applyMasteryXpInTx(
            characterId, masteryXpResult.masteryDefinitionKey, masteryXpResult.xpAmount, manager,
          );
        }

        return { matResult, updatedResource, characterXpUpdate, masteryUpdate };
      });
    } catch {
      this.cancelGathering(client, targetId, 'error');
      return;
    }

    const { matResult, updatedResource, characterXpUpdate, masteryUpdate } = txOut;

    // 📤 Envoie chaque entrée de loot au client
    for (const stack of matResult.stacks) {
      const entry = lootEntries.find((e) => e.itemId === stack.item.category);
      client.emit('resource_loot', {
        itemId: stack.item.id,
        lootItemId: stack.item.category,
        quantity: entry?.quantity ?? stack.quantity,
        total: stack.quantity,
        item: {
          id: stack.item.id,
          name: stack.item.name,
          image: stack.item.image,
        },
      });
    }

    // Loot INSTANCE (ex: arme) : pas de stack optimiste possible → refresh
    // autoritatif de l'inventaire du joueur (projection avec instanceId correct).
    if (matResult.instances.length > 0) client.emit('character:reload');

    if (characterXpUpdate) client.emit('character_xp_update', characterXpUpdate);
    if (masteryUpdate) client.emit('mastery_update', masteryUpdate);

    // 🔄 Mise à jour visuelle pour les joueurs de la même map
    const mapId = (updatedResource as any).mapId ?? DEFAULT_MAP_ID;
    this.server.to(getMapRoomId(mapId)).emit('resource_update', this.resources.buildResourceBroadcast(updatedResource as any, template?.textureKey));

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
    if (player.mapId !== target.mapId) return false;
    return chebyshevDistanceWU(player, target as { worldX: number; worldY: number; mapId: number }) <= RESOURCE_INTERACT_RANGE_WU;
  }

  private cancelGathering(client: WorldSocket, targetId: string, reason: string) {
    this.clearSession(client.id);
    client.emit('gather_cancelled', { targetId, reason });
    // Arrête le cercle de progression côté WorldScene (cosmétique).
    client.emit('gather_stopped', { targetId });
  }

  private clearSession(socketId: string) {
    const session = this.gatherSessions.get(socketId);
    if (session) {
      clearTimeout(session.timer);
      this.gatherSessions.delete(socketId);
    }
  }

  private async sendResources(client: WorldSocket) {
    // findAllWithTextureKey enrichit chaque resource avec la textureKey de son
    // template : sans ça le client retombe sur le fallback dead_tree.
    const resources = await this.resources.findAllWithTextureKey();
    client.emit('resources', resources);
  }
}
