// apps/api-gateway/src/resources/resources.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from './entities/resource.entity';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private repo: Repository<Resource>,
  ) {}

  findAll() {
    return this.repo.find();
  }

  /**
   * 🔍 Récupère une ressource par ID
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
   * 🪓 Marque une ressource comme "dead"
   */
  async markGathered(id: string) {
    await this.repo.update(id, { state: 'dead', remainingLoots: 0 });
  }
}
