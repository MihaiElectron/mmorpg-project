import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameConfig } from './game-config.entity';

const SINGLETON_ID = 1;

@Injectable()
export class GameConfigService implements OnModuleInit {
  private readonly logger = new Logger(GameConfigService.name);
  private cachedConfig: GameConfig | null = null;

  constructor(
    @InjectRepository(GameConfig)
    private readonly repo: Repository<GameConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    let config = await this.repo.findOne({ where: { id: SINGLETON_ID } });
    if (!config) {
      config = this.repo.create({ id: SINGLETON_ID });
      await this.repo.save(config);
      this.logger.log('GameConfig singleton créé avec les valeurs par défaut.');
    }
    this.cachedConfig = config;
  }

  async getConfig(): Promise<GameConfig> {
    if (!this.cachedConfig) {
      const config = await this.repo.findOne({ where: { id: SINGLETON_ID } });
      if (!config) throw new Error('GameConfig singleton manquant en base.');
      this.cachedConfig = config;
    }
    return this.cachedConfig;
  }

  async update(fields: Partial<Pick<GameConfig, 'characterBaseXpPerLevel' | 'characterXpCurveExponent' | 'characterMaxLevel'>>): Promise<GameConfig> {
    const config = await this.getConfig();
    Object.assign(config, fields);
    const saved = await this.repo.save(config);
    this.invalidateCache();
    return saved;
  }

  invalidateCache(): void {
    this.cachedConfig = null;
  }
}
