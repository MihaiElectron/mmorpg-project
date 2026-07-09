// apps/api-gateway/src/resources/resources.service.ts
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, IsNull, Repository } from 'typeorm';
import { Server } from 'socket.io';
import { Resource } from './entities/resource.entity';
import { ResourceTemplate } from './entities/resource-template.entity';
import { DEFAULT_MAP_ID } from '../common/world-coordinates';
import { getMapRoomId } from '../common/socket-rooms';

export const RESOURCE_TEMPLATES: Pick<
  ResourceTemplate,
  'type' | 'defaultRemainingLoots' | 'respawnDelayMs' | 'lootPool' | 'masteryKey' | 'gatheringXpReward' | 'textureKey'
>[] = [
  {
    type: 'dead_tree',
    textureKey: 'dead_tree',
    defaultRemainingLoots: 4,
    respawnDelayMs: 60_000,
    lootPool: [{ itemId: 'wooden_stick', minQty: 1, maxQty: 2, probability: 1 }],
    masteryKey: 'woodcutting',
    gatheringXpReward: 5,
  },
  {
    type: 'ore',
    textureKey: 'dead_tree',
    defaultRemainingLoots: 6,
    respawnDelayMs: 120_000,
    lootPool: [{ itemId: 'iron_ore', minQty: 1, maxQty: 1, probability: 1 }],
    masteryKey: 'mining',
    gatheringXpReward: 5,
  },
];

// Délai de respawn par défaut si aucun champ template n'existe.
export const RESOURCE_RESPAWN_DELAY_MS = 30_000;

@Injectable()
export class ResourcesService implements OnModuleInit {
  private readonly logger = new Logger(ResourcesService.name);

  // IDs des ressources dont le respawn est déjà planifié (évite les doubles timers).
  private readonly pendingRespawns = new Set<string>();

  // Token actif par resource. Chaque armRespawnTimer capture le token à sa création.
  // Si le token a changé (forceRespawn ou nouveau schedule) quand le timer se déclenche,
  // doRespawn détecte la discordance et abandonne sans toucher la DB.
  private readonly pendingRespawnTokens = new Map<string, number>();
  private nextRespawnToken = 0;

  // Serveur WebSocket injecté par le gateway via setServer() dans afterInit.
  private server: Server | null = null;

  constructor(
    @InjectRepository(Resource)
    private repo: Repository<Resource>,
    @InjectRepository(ResourceTemplate)
    private templateRepo: Repository<ResourceTemplate>,
  ) {}

  setServer(server: Server): void {
    this.server = server;
  }

  async onModuleInit() {
    await this.templateRepo
      .createQueryBuilder()
      .insert()
      .values(RESOURCE_TEMPLATES as any[])
      .orIgnore()
      .execute();
    await this.backfillGatheringFields();
    await this.reloadPendingRespawns();
  }

  /**
   * Backfill non-destructif : met à jour masteryKey/gatheringXpReward uniquement
   * sur les templates dont masteryKey est encore null (créés avant ces champs).
   * Préserve les overrides admin éventuels.
   */
  private async backfillGatheringFields(): Promise<void> {
    for (const def of RESOURCE_TEMPLATES) {
      if (!def.masteryKey) continue;
      await this.templateRepo.update(
        { type: def.type, masteryKey: IsNull() },
        { masteryKey: def.masteryKey, gatheringXpReward: def.gatheringXpReward ?? 0 },
      );
    }
  }

  getTemplate(type: string): Promise<ResourceTemplate | null> {
    return this.templateRepo.findOne({ where: { type } });
  }

  async getDefaultRemainingLoots(type: string): Promise<number> {
    const tpl = await this.templateRepo.findOne({ where: { type } });
    return tpl?.defaultRemainingLoots ?? 9999;
  }

  /**
   * Résout le délai de respawn depuis le template de la ressource.
   * Fallback vers RESOURCE_RESPAWN_DELAY_MS si template absent ou respawnDelayMs invalide.
   */
  private async resolveRespawnDelay(resourceId: string): Promise<number> {
    const resource = await this.findOne(resourceId);
    if (!resource) return RESOURCE_RESPAWN_DELAY_MS;
    if (resource.respawnDelayMs != null && resource.respawnDelayMs > 0) return resource.respawnDelayMs;
    const tpl = await this.templateRepo.findOne({ where: { type: resource.type } });
    const delay = tpl?.respawnDelayMs;
    return delay != null && delay > 0 ? delay : RESOURCE_RESPAWN_DELAY_MS;
  }

  findAll() {
    return this.repo.find();
  }

  findOne(id: string) {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Consomme une charge de récolte.
   * La ressource ne disparaît que lorsque remainingLoots atteint 0.
   */
  async consumeLoot(id: string) {
    const resource = await this.findOne(id);

    if (!resource || resource.state === 'dead') {
      return resource;
    }

    const remainingLoots = Math.max((resource.remainingLoots ?? 9999) - 1, 0);
    const state = remainingLoots === 0 ? 'dead' : 'alive';

    await this.repo.update(id, { remainingLoots, state });

    return {
      ...resource,
      remainingLoots,
      state,
    };
  }

  /**
   * Variante transactionnelle de consumeLoot : opère dans la transaction de
   * l'appelant (EntityManager fourni). Verrou pessimiste sur la ligne pour un
   * décrément atomique. Retourne null si la ressource est absente/déjà morte.
   */
  async consumeLootInManager(manager: import('typeorm').EntityManager, id: string): Promise<Resource | null> {
    const resource = await manager.findOne(Resource, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!resource || resource.state === 'dead') return null;

    const remainingLoots = Math.max((resource.remainingLoots ?? 9999) - 1, 0);
    const state: 'alive' | 'dead' = remainingLoots === 0 ? 'dead' : 'alive';

    await manager.update(Resource, id, { remainingLoots, state });

    resource.remainingLoots = remainingLoots;
    resource.state = state;
    return resource;
  }

  /**
   * Force le respawn immédiat d'une resource quelle que soit son état.
   * Invalide le token courant : tout ancien timer armé deviendra no-op à son expiration.
   */
  async forceRespawn(id: string): Promise<Resource | null> {
    const resource = await this.findOne(id);
    if (!resource) return null;

    this.pendingRespawns.delete(id);
    this.pendingRespawnTokens.delete(id);

    const remainingLoots = await this.getDefaultRemainingLoots(resource.type);
    await this.repo.update(id, { state: 'alive', remainingLoots, respawnAt: null });

    const template = await this.getTemplate(resource.type);
    const updated: Resource = { ...resource, state: 'alive', remainingLoots, respawnAt: null };

    if (this.server) {
      this.server.to(getMapRoomId(updated.mapId ?? DEFAULT_MAP_ID)).emit('resource_update', this.buildResourceBroadcast(updated, template?.textureKey));
    }

    return updated;
  }

  /**
   * Réinitialise une instance Resource depuis son template :
   * remainingLoots = template.defaultRemainingLoots, state = alive, respawnAt = null.
   * Invalide le timer de respawn en cours comme forceRespawn.
   * Lève BadRequestException si le template est absent.
   */
  async resetInstanceFromTemplate(id: string): Promise<Resource | null> {
    const resource = await this.findOne(id);
    if (!resource) return null;

    const template = await this.templateRepo.findOne({ where: { type: resource.type } });
    if (!template) {
      throw new BadRequestException(`Template absent pour le type "${resource.type}".`);
    }

    this.pendingRespawns.delete(id);
    this.pendingRespawnTokens.delete(id);

    const remainingLoots = template.defaultRemainingLoots;
    await this.repo.update(id, { state: 'alive', remainingLoots, respawnAt: null });

    const updated: Resource = { ...resource, state: 'alive', remainingLoots, respawnAt: null };

    if (this.server) {
      this.server.to(getMapRoomId(updated.mapId ?? DEFAULT_MAP_ID)).emit('resource_update', this.buildResourceBroadcast(updated, template.textureKey));
    }

    return updated;
  }

  /**
   * Marque une ressource comme "dead"
   */
  async markGathered(id: string) {
    await this.repo.update(id, { state: 'dead', remainingLoots: 0 });
  }

  /**
   * Planifie le respawn d'une ressource morte.
   * Résout le délai depuis le template (fallback RESOURCE_RESPAWN_DELAY_MS).
   * Persiste respawnAt en DB avant d'armer le timer.
   * Sans effet si un respawn est déjà en attente pour cet ID.
   * delayMs est un override interne pour les tests.
   */
  async scheduleRespawn(id: string, delayMs?: number): Promise<void> {
    if (this.pendingRespawns.has(id)) return;
    this.pendingRespawns.add(id);

    const token = ++this.nextRespawnToken;
    this.pendingRespawnTokens.set(id, token);

    const resolvedDelay = delayMs ?? await this.resolveRespawnDelay(id);
    const respawnAt = new Date(Date.now() + resolvedDelay);
    await this.repo.update(id, { respawnAt });

    // Broadcast avec respawnAt pour que le panneau admin affiche le timer
    const resource = await this.findOne(id);
    if (resource && this.server) {
      const template = await this.getTemplate(resource.type);
      this.server.to(getMapRoomId(resource.mapId ?? DEFAULT_MAP_ID)).emit('resource_update', this.buildResourceBroadcast({ ...resource, respawnAt }, template?.textureKey));
    }

    this.armRespawnTimer(id, resolvedDelay, token);
  }

  /**
   * Remet une ressource en état alive avec ses loots restaurés depuis le template.
   * Efface respawnAt.
   *
   * Si token est fourni (appel interne depuis armRespawnTimer), vérifie qu'il correspond
   * au token actif : retourne null sans modifier la DB en cas de discordance.
   * Appelé sans token (tests directs) : bypass du check pour compatibilité.
   */
  async doRespawn(id: string, token?: number): Promise<Resource | null> {
    if (token !== undefined) {
      if (this.pendingRespawnTokens.get(id) !== token) return null;
      this.pendingRespawnTokens.delete(id);
      this.pendingRespawns.delete(id);
    }

    const resource = await this.findOne(id);
    if (!resource) return null;

    const remainingLoots = await this.getDefaultRemainingLoots(resource.type);
    await this.repo.update(id, { state: 'alive', remainingLoots, respawnAt: null });
    return { ...resource, state: 'alive', remainingLoots, respawnAt: null };
  }

  /**
   * Au démarrage : replanifie les timers pour les resources mortes avec respawnAt persisté.
   * Respawn immédiat si respawnAt est dans le passé.
   * Les resources dead sans respawnAt ne sont pas touchées.
   */
  private async reloadPendingRespawns(): Promise<void> {
    const pending = await this.repo.find({
      where: { state: 'dead', respawnAt: Not(IsNull()) },
    });

    if (pending.length === 0) return;
    this.logger.log(`Replanification de ${pending.length} resource(s) en attente de respawn`);

    const now = Date.now();
    for (const resource of pending) {
      if (!resource.respawnAt) {
        this.logger.warn(`Resource ${resource.id} dead sans respawnAt — ignorée`);
        continue;
      }
      if (this.pendingRespawns.has(resource.id)) continue;
      this.pendingRespawns.add(resource.id);

      const token = ++this.nextRespawnToken;
      this.pendingRespawnTokens.set(resource.id, token);

      const remaining = resource.respawnAt.getTime() - now;
      this.armRespawnTimer(resource.id, Math.max(remaining, 0), token);
    }
  }

  /**
   * Construit le payload resource_update complet pour le client.
   * Inclut type et coordonnées WU nécessaires au rendu Phaser.
   * Sans type/position WU, upsertResource ne peut pas recréer le sprite après un dead.
   */
  buildResourceBroadcast(resource: Resource, textureKey?: string | null): Record<string, unknown> {
    return {
      id:             resource.id,
      type:           resource.type,
      textureKey:     textureKey ?? null,
      state:          resource.state,
      remainingLoots: resource.remainingLoots,
      respawnAt:      resource.respawnAt      ?? null,
      respawnDelayMs: resource.respawnDelayMs ?? null,
      worldX:         resource.worldX  ?? null,
      worldY:         resource.worldY  ?? null,
      mapId:          resource.mapId   ?? null,
    };
  }

  /**
   * Enrichit une liste de Resource avec textureKey depuis leurs templates.
   * Effectue un seul SELECT de templates groupés par type distinct.
   */
  async findAllWithTextureKey(): Promise<Array<Resource & { textureKey: string | null }>> {
    const resources = await this.repo.find();
    if (resources.length === 0) return [];

    const types = [...new Set(resources.map((r) => r.type))];
    const templates = await this.templateRepo.find({
      where: { type: In(types) },
      select: ['type', 'textureKey'],
    });

    const textureByType = new Map(templates.map((t) => [t.type, t.textureKey]));
    return resources.map((r) => ({ ...r, textureKey: textureByType.get(r.type) ?? null }));
  }

  /**
   * Arme le setTimeout qui déclenche doRespawn et broadcast resource_update.
   * Le token capturé est passé à doRespawn : si le token a été invalidé entre-temps
   * (forceRespawn ou double schedule), doRespawn retourne null sans toucher la DB.
   */
  private armRespawnTimer(id: string, delayMs: number, token: number): void {
    setTimeout(async () => {
      const respawned = await this.doRespawn(id, token);
      if (respawned && this.server) {
        const template = await this.getTemplate(respawned.type);
        this.server.to(getMapRoomId(respawned.mapId ?? DEFAULT_MAP_ID)).emit('resource_update', this.buildResourceBroadcast(respawned, template?.textureKey));
      }
    }, delayMs);
  }
}
