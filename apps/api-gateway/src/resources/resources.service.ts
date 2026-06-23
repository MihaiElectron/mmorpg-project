// apps/api-gateway/src/resources/resources.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from './entities/resource.entity';
import { ResourceTemplate } from './entities/resource-template.entity';

const RESOURCE_TEMPLATES: Pick<ResourceTemplate, 'type' | 'defaultRemainingLoots'>[] = [
  { type: 'dead_tree', defaultRemainingLoots: 9999 },
  { type: 'ore',       defaultRemainingLoots: 9999 },
];

// Délai de respawn par défaut si aucun champ template n'existe.
export const RESOURCE_RESPAWN_DELAY_MS = 30_000;

@Injectable()
export class ResourcesService implements OnModuleInit {
  // IDs des ressources dont le respawn est déjà planifié (évite les doubles timers).
  private readonly pendingRespawns = new Set<string>();

  constructor(
    @InjectRepository(Resource)
    private repo: Repository<Resource>,
    @InjectRepository(ResourceTemplate)
    private templateRepo: Repository<ResourceTemplate>,
  ) {}

  async onModuleInit() {
    await this.templateRepo.upsert(RESOURCE_TEMPLATES, ['type']);
  }

  async getDefaultRemainingLoots(type: string): Promise<number> {
    const tpl = await this.templateRepo.findOne({ where: { type } });
    return tpl?.defaultRemainingLoots ?? 9999;
  }

  findAll() {
    return this.repo.find();
  }

  /**
   * Récupère une ressource par ID
   */
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
   * Marque une ressource comme "dead"
   */
  async markGathered(id: string) {
    await this.repo.update(id, { state: 'dead', remainingLoots: 0 });
  }

  /**
   * Planifie le respawn d'une ressource morte.
   * Sans effet si un respawn est déjà en attente pour cet ID.
   * Le callback onRespawned est appelé avec la ressource restaurée
   * (utilisé par le gateway pour broadcaster resource_update).
   */
  scheduleRespawn(
    id: string,
    onRespawned: (resource: Resource) => void,
    delayMs = RESOURCE_RESPAWN_DELAY_MS,
  ): void {
    if (this.pendingRespawns.has(id)) return;
    this.pendingRespawns.add(id);

    setTimeout(async () => {
      this.pendingRespawns.delete(id);
      const respawned = await this.doRespawn(id);
      if (respawned) onRespawned(respawned);
    }, delayMs);
  }

  /**
   * Remet une ressource en état alive avec ses loots restaurés depuis le template.
   */
  async doRespawn(id: string): Promise<Resource | null> {
    const resource = await this.findOne(id);
    if (!resource) return null;

    const remainingLoots = await this.getDefaultRemainingLoots(resource.type);
    await this.repo.update(id, { state: 'alive', remainingLoots });
    return { ...resource, state: 'alive', remainingLoots };
  }
}
