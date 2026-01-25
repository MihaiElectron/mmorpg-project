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
   * 🪓 Marque une ressource comme "dead"
   */
  async markGathered(id: string) {
    await this.repo.update(id, { state: 'dead' });
  }
}
