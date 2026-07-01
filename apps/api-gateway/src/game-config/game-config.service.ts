import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameConfig } from './game-config.entity';

@Injectable()
export class GameConfigService implements OnModuleInit {
  private cachedConfig: GameConfig | null = null;

  constructor(
    @InjectRepository(GameConfig)
    private readonly repo: Repository<GameConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    const existing = await this.repo.findOne({ where: { id: 1 } });
    if (!existing) {
      await this.repo.save(this.repo.create({ id: 1 }));
    }
  }

  async getConfig(): Promise<GameConfig> {
    if (this.cachedConfig) return this.cachedConfig;
    const config = await this.repo.findOne({ where: { id: 1 } });
    if (!config) throw new Error('GameConfig singleton manquant (id=1).');
    this.cachedConfig = config;
    return config;
  }

  invalidateCache(): void {
    this.cachedConfig = null;
  }
}
