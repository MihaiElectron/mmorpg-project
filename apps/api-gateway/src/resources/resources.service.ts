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

@Injectable()
export class ResourcesService implements OnModuleInit {
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
}
