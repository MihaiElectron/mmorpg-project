import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreatureSecondaryCoefficients,
  DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
} from '../creature-runtime/creature-runtime.calculator';
import { CreatureSecondaryCoefficientConfig } from './entities/creature-secondary-coefficient-config.entity';

/** Les 14 clés du contrat `CreatureSecondaryCoefficients`. */
const COEFFICIENT_KEYS = Object.keys(
  DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
) as (keyof CreatureSecondaryCoefficients)[];

/**
 * CreatureSecondaryCoefficientsService (V6-B2.5 Lot 2).
 *
 * Source serveur unique des coefficients de dérivation des secondaires créature.
 * Charge le singleton DB (id=1) au démarrage et le maintient dans un cache
 * mémoire. `getCoefficients()` est SYNCHRONE (chemin combat chaud) et retourne
 * toujours une config valide : le cache est initialisé au fallback code
 * (`DEFAULT_CREATURE_SECONDARY_COEFFICIENTS`), donc jamais d'accès DB par hit et
 * jamais de valeur invalide, même avant le chargement ou en cas d'erreur DB.
 */
@Injectable()
export class CreatureSecondaryCoefficientsService implements OnModuleInit {
  private readonly logger = new Logger(CreatureSecondaryCoefficientsService.name);

  /** Cache mémoire — initialisé au fallback code (toujours valide). */
  private cached: CreatureSecondaryCoefficients = { ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS };

  constructor(
    @InjectRepository(CreatureSecondaryCoefficientConfig)
    private readonly repo: Repository<CreatureSecondaryCoefficientConfig>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const existing = await this.repo.findOne({ where: { id: 1 } });
      if (!existing) {
        // Seed du singleton avec les defaults (idempotent avec la migration).
        await this.repo.save(this.repo.create({ id: 1, ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS }));
        this.cached = { ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS };
        return;
      }
      this.cached = this.sanitize(existing);
    } catch (err) {
      // Ne jamais casser le runtime combat : on garde les defaults en mémoire.
      this.logger.warn(
        `Chargement des coefficients créature impossible, fallback sur les defaults (${(err as Error).message}).`,
      );
      this.cached = { ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS };
    }
  }

  /**
   * Coefficients effectifs (lecture synchrone, O(1), zéro I/O). Toujours valide.
   * Retourne une COPIE défensive pour empêcher toute mutation externe du cache.
   */
  getCoefficients(): CreatureSecondaryCoefficients {
    return { ...this.cached };
  }

  /** Recharge le cache depuis la DB (après une écriture externe, ex. Lot 3). */
  async reloadCache(): Promise<CreatureSecondaryCoefficients> {
    const row = await this.repo.findOne({ where: { id: 1 } });
    this.cached = row ? this.sanitize(row) : { ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS };
    return this.getCoefficients();
  }

  /**
   * Applique un patch partiel sur le singleton (id=1) et rafraîchit le cache.
   * Fourni pour le Lot 3 (endpoint admin) ; AUCUN endpoint n'est créé ici.
   * Les clés inconnues et les valeurs non finies sont ignorées ; les clés
   * absentes conservent la valeur courante.
   */
  async updateCoefficients(
    patch: Partial<CreatureSecondaryCoefficients>,
  ): Promise<CreatureSecondaryCoefficients> {
    const current = (await this.repo.findOne({ where: { id: 1 } })) ??
      this.repo.create({ id: 1, ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS });
    for (const key of COEFFICIENT_KEYS) {
      const value = patch[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        current[key] = value;
      }
    }
    current.id = 1;
    await this.repo.save(current);
    return this.reloadCache();
  }

  /**
   * Construit un `CreatureSecondaryCoefficients` valide depuis une ligne DB
   * potentiellement partielle/altérée : toute valeur absente ou non finie
   * (null, NaN, Infinity, mauvais type) retombe sur le default de la clé.
   */
  private sanitize(
    row: Partial<CreatureSecondaryCoefficientConfig>,
  ): CreatureSecondaryCoefficients {
    const out = { ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS };
    for (const key of COEFFICIENT_KEYS) {
      const value = row[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = value;
      }
    }
    return out;
  }
}
