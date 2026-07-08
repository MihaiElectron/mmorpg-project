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

  /**
   * Applique un patch partiel sur le singleton (id=1) et invalide le cache.
   * Seul point d'écriture des règles globales. Aucun recalcul de personnage
   * n'est déclenché ici (ADR-0018 §1 — hors Étape 1A).
   */
  async updateConfig(patch: Partial<GameConfig>): Promise<GameConfig> {
    const current = await this.getConfig();
    // On ignore toute tentative de changer la clé primaire.
    const { id: _ignore, ...safePatch } = patch;
    const merged = this.repo.merge(current, safePatch);
    merged.id = 1;
    const saved = await this.repo.save(merged);
    this.invalidateCache();
    return saved;
  }

  invalidateCache(): void {
    this.cachedConfig = null;
  }
}
