import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';
import { CreatureTemplateDerivedStatOverride } from './entities/creature-template-derived-stat-override.entity';
import { CreatureTemplateDerivedCoefficient } from './entities/creature-template-derived-coefficient.entity';
import { CreatureTemplateScalarOverride } from './entities/creature-template-scalar-override.entity';
import {
  CoefficientMap,
  CreatureTemplateOverrides,
  EMPTY_TEMPLATE_OVERRIDES,
  isCreatureScalarParamKey,
  isPrimaryStatKey,
} from './creature-template-overrides.constants';

/** Entrée de coefficient primaire pour une écriture d'override. */
export interface DerivedCoefficientInput {
  primaryStatKey: string;
  coefficient: number;
}

/** Override d'une dérivée pour un remplacement complet (map, éventuellement vide). */
export interface DerivedOverrideInput {
  derivedStatKey: string;
  coefficients: DerivedCoefficientInput[];
}

/** Override scalaire pour un remplacement complet. */
export interface ScalarOverrideInput {
  scalarParamKey: string;
  value: number;
}

/** Configuration complète d'un template (remplacement intégral). */
export interface TemplateConfigurationInput {
  derivedOverrides: DerivedOverrideInput[];
  scalarOverrides: ScalarOverrideInput[];
}

/**
 * CreatureTemplateOverridesService — overrides de dérivation PAR TEMPLATE.
 *
 * PostgreSQL est l'autorité ; le cache mémoire (Map par `creatureTemplateId`) est
 * une optimisation pour la lecture SYNCHRONE du chemin combat chaud. Chargé
 * intégralement au démarrage ; rafraîchi atomiquement après chaque écriture.
 * L'absence d'un template dans le cache = aucun override persistant (le cache
 * reflète la DB après un chargement complet, jamais une absence par défaut).
 */
@Injectable()
export class CreatureTemplateOverridesService implements OnModuleInit {
  private readonly logger = new Logger(CreatureTemplateOverridesService.name);

  /** Cache : templateId → overrides résolus. Absent = aucun override. */
  private cache = new Map<number, CreatureTemplateOverrides>();

  /** Abonnés notifiés (templateId) après une écriture — ex: invalidation maxHealth. */
  private readonly changeListeners: Array<(templateId: number) => void> = [];

  constructor(
    @InjectRepository(CreatureTemplateDerivedStatOverride)
    private readonly overrideRepo: Repository<CreatureTemplateDerivedStatOverride>,
    @InjectRepository(CreatureTemplateDerivedCoefficient)
    private readonly coefficientRepo: Repository<CreatureTemplateDerivedCoefficient>,
    @InjectRepository(CreatureTemplateScalarOverride)
    private readonly scalarRepo: Repository<CreatureTemplateScalarOverride>,
    private readonly derivedStats: DerivedStatsService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.reloadAll();
    } catch (err) {
      // Chargement impossible : log ERROR (ne pas masquer une DB indisponible en
      // « aucun override ») et cache vide en attendant un rechargement.
      this.logger.error(
        `Chargement des overrides de template créature impossible (${(err as Error).message}). ` +
          `Le combat utilisera le fallback global tant que le rechargement n'a pas réussi.`,
      );
      this.cache = new Map();
    }
  }

  /** Enregistre un abonné notifié après chaque écriture d'override sur un template. */
  onChange(listener: (templateId: number) => void): void {
    this.changeListeners.push(listener);
  }

  /** Overrides résolus d'un template (lecture synchrone, copie défensive). */
  getOverrides(templateId: number): CreatureTemplateOverrides {
    const cached = this.cache.get(templateId);
    if (!cached) return EMPTY_TEMPLATE_OVERRIDES;
    return {
      derivedCoefficients: { ...cached.derivedCoefficients },
      scalarParams: { ...cached.scalarParams },
    };
  }

  /** Recharge TOUT le cache depuis PostgreSQL (autorité). */
  async reloadAll(): Promise<void> {
    const [headers, coefficients, scalars] = await Promise.all([
      this.overrideRepo.find(),
      this.coefficientRepo.find(),
      this.scalarRepo.find(),
    ]);
    const coefByOverride = new Map<string, CoefficientMap>();
    for (const c of coefficients) {
      const map = (coefByOverride.get(c.overrideId) ?? {}) as Record<string, number>;
      map[c.primaryStatKey] = c.coefficient;
      coefByOverride.set(c.overrideId, map);
    }
    const next = new Map<number, { derivedCoefficients: Record<string, CoefficientMap>; scalarParams: Record<string, number> }>();
    const ensure = (templateId: number) => {
      let e = next.get(templateId);
      if (!e) {
        e = { derivedCoefficients: {}, scalarParams: {} };
        next.set(templateId, e);
      }
      return e;
    };
    for (const h of headers) {
      // Map présente MÊME si aucun coefficient enfant (map vide volontaire).
      ensure(h.creatureTemplateId).derivedCoefficients[h.derivedStatKey] =
        coefByOverride.get(h.id) ?? {};
    }
    for (const s of scalars) {
      ensure(s.creatureTemplateId).scalarParams[s.scalarParamKey] = s.value;
    }
    this.cache = next;
  }

  /** Recharge un seul template (après écriture) — atomique côté cache. */
  async reloadTemplate(templateId: number): Promise<void> {
    const [headers, scalars] = await Promise.all([
      this.overrideRepo.find({ where: { creatureTemplateId: templateId } }),
      this.scalarRepo.find({ where: { creatureTemplateId: templateId } }),
    ]);
    const entry = { derivedCoefficients: {} as Record<string, CoefficientMap>, scalarParams: {} as Record<string, number> };
    for (const h of headers) {
      const children = await this.coefficientRepo.find({ where: { overrideId: h.id } });
      const map: Record<string, number> = {};
      for (const c of children) map[c.primaryStatKey] = c.coefficient;
      entry.derivedCoefficients[h.derivedStatKey] = map;
    }
    for (const s of scalars) entry.scalarParams[s.scalarParamKey] = s.value;

    const nextCache = new Map(this.cache);
    if (headers.length === 0 && scalars.length === 0) {
      nextCache.delete(templateId);
    } else {
      nextCache.set(templateId, entry);
    }
    this.cache = nextCache; // remplacement atomique de la référence
  }

  /**
   * Définit (upsert) l'override de coefficients d'une dérivée pour un template.
   * `coefficients` peut être VIDE (map vide volontaire → zéro contribution).
   * Transactionnel : marqueur + remplacement intégral des enfants.
   */
  async setDerivedStatOverride(
    templateId: number,
    derivedStatKey: string,
    coefficients: DerivedCoefficientInput[],
  ): Promise<void> {
    await this.assertValidDerivedStatKey(derivedStatKey);
    this.assertValidCoefficients(coefficients);

    await this.dataSource.transaction(async (manager) => {
      const headerRepo = manager.getRepository(CreatureTemplateDerivedStatOverride);
      const coefRepo = manager.getRepository(CreatureTemplateDerivedCoefficient);
      let header = await headerRepo.findOne({ where: { creatureTemplateId: templateId, derivedStatKey } });
      if (!header) {
        header = await headerRepo.save(headerRepo.create({ creatureTemplateId: templateId, derivedStatKey }));
      }
      await coefRepo.delete({ overrideId: header.id });
      if (coefficients.length > 0) {
        await coefRepo.save(
          coefficients.map((c) =>
            coefRepo.create({ overrideId: header!.id, primaryStatKey: c.primaryStatKey, coefficient: c.coefficient }),
          ),
        );
      }
    });

    await this.reloadTemplate(templateId);
    this.notifyChange(templateId);
  }

  /**
   * REMPLACE INTÉGRALEMENT la configuration d'overrides d'un template (§4).
   * Sémantique de remplacement complet (bouton « Sauvegarder ») :
   *  - dérivée absente de `derivedOverrides` → override supprimé (fallback) ;
   *  - présente avec coefficients → map remplacée ;
   *  - présente avec `coefficients: []` → override VIDE volontaire conservé ;
   *  - scalaire absent → override supprimé (fallback) ; présent → valeur remplacée.
   *
   * ATOMIQUE : tout le DTO est validé AVANT toute écriture ; une seule
   * transaction PostgreSQL (delete total + réinsertion) ; le cache n'est
   * rafraîchi et les listeners notifiés qu'APRÈS le commit (une seule fois).
   * Aucune écriture partielle si une entrée est invalide.
   */
  async replaceTemplateConfiguration(
    templateId: number,
    input: TemplateConfigurationInput,
  ): Promise<void> {
    // ── 1. Validation COMPLÈTE avant toute modification ──────────────────────
    const seenDerived = new Set<string>();
    for (const d of input.derivedOverrides) {
      await this.assertValidDerivedStatKey(d.derivedStatKey);
      if (seenDerived.has(d.derivedStatKey)) {
        throw new BadRequestException(`derivedStatKey dupliqué dans le DTO: ${d.derivedStatKey}`);
      }
      seenDerived.add(d.derivedStatKey);
      this.assertValidCoefficients(d.coefficients);
    }
    const seenScalar = new Set<string>();
    for (const s of input.scalarOverrides) {
      if (!isCreatureScalarParamKey(s.scalarParamKey)) {
        throw new BadRequestException(`scalarParamKey inconnu: ${s.scalarParamKey}`);
      }
      if (seenScalar.has(s.scalarParamKey)) {
        throw new BadRequestException(`scalarParamKey dupliqué dans le DTO: ${s.scalarParamKey}`);
      }
      seenScalar.add(s.scalarParamKey);
      if (typeof s.value !== 'number' || !Number.isFinite(s.value)) {
        throw new BadRequestException(`value scalaire non finie pour ${s.scalarParamKey}.`);
      }
    }

    // ── 2. Remplacement dans UNE transaction (delete total + réinsertion) ────
    await this.dataSource.transaction(async (manager) => {
      const headerRepo = manager.getRepository(CreatureTemplateDerivedStatOverride);
      const scalarRepo = manager.getRepository(CreatureTemplateScalarOverride);
      // CASCADE supprime les coefficients enfants avec les marqueurs.
      await headerRepo.delete({ creatureTemplateId: templateId });
      await scalarRepo.delete({ creatureTemplateId: templateId });

      const coefRepo = manager.getRepository(CreatureTemplateDerivedCoefficient);
      for (const d of input.derivedOverrides) {
        const header = await headerRepo.save(
          headerRepo.create({ creatureTemplateId: templateId, derivedStatKey: d.derivedStatKey }),
        );
        if (d.coefficients.length > 0) {
          await coefRepo.save(
            d.coefficients.map((c) =>
              coefRepo.create({ overrideId: header.id, primaryStatKey: c.primaryStatKey, coefficient: c.coefficient }),
            ),
          );
        }
      }
      for (const s of input.scalarOverrides) {
        await scalarRepo.save(
          scalarRepo.create({ creatureTemplateId: templateId, scalarParamKey: s.scalarParamKey, value: s.value }),
        );
      }
    });

    // ── 3. Après COMMIT seulement : cache rafraîchi + une notification ───────
    await this.reloadTemplate(templateId);
    this.notifyChange(templateId);
  }

  /** Retire l'override de coefficients d'une dérivée (retour au fallback). */
  async removeDerivedStatOverride(templateId: number, derivedStatKey: string): Promise<void> {
    await this.overrideRepo.delete({ creatureTemplateId: templateId, derivedStatKey });
    await this.reloadTemplate(templateId);
    this.notifyChange(templateId);
  }

  /** Définit (upsert) un paramètre scalaire du template. */
  async setScalarOverride(templateId: number, scalarParamKey: string, value: number): Promise<void> {
    if (!isCreatureScalarParamKey(scalarParamKey)) {
      throw new BadRequestException(`scalarParamKey inconnu: ${scalarParamKey}`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`value scalaire doit être un nombre fini (reçu ${value}).`);
    }
    const existing = await this.scalarRepo.findOne({ where: { creatureTemplateId: templateId, scalarParamKey } });
    if (existing) {
      existing.value = value;
      await this.scalarRepo.save(existing);
    } else {
      await this.scalarRepo.save(this.scalarRepo.create({ creatureTemplateId: templateId, scalarParamKey, value }));
    }
    await this.reloadTemplate(templateId);
    this.notifyChange(templateId);
  }

  /** Retire un paramètre scalaire (retour au fallback global). */
  async removeScalarOverride(templateId: number, scalarParamKey: string): Promise<void> {
    await this.scalarRepo.delete({ creatureTemplateId: templateId, scalarParamKey });
    await this.reloadTemplate(templateId);
    this.notifyChange(templateId);
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  private async assertValidDerivedStatKey(derivedStatKey: string): Promise<void> {
    const definitions = await this.derivedStats.getDefinitions();
    if (!definitions.some((d) => d.key === derivedStatKey)) {
      throw new BadRequestException(
        `derivedStatKey inconnu (absent du catalogue derived_stat_definition): ${derivedStatKey}`,
      );
    }
  }

  private assertValidCoefficients(coefficients: DerivedCoefficientInput[]): void {
    const seen = new Set<string>();
    for (const c of coefficients) {
      if (!isPrimaryStatKey(c.primaryStatKey)) {
        throw new BadRequestException(`primaryStatKey inconnu: ${c.primaryStatKey}`);
      }
      if (seen.has(c.primaryStatKey)) {
        throw new BadRequestException(`primaryStatKey dupliqué: ${c.primaryStatKey}`);
      }
      seen.add(c.primaryStatKey);
      if (typeof c.coefficient !== 'number' || !Number.isFinite(c.coefficient)) {
        throw new BadRequestException(
          `coefficient doit être un nombre fini (reçu ${c.coefficient} pour ${c.primaryStatKey}).`,
        );
      }
    }
  }

  private notifyChange(templateId: number): void {
    for (const listener of this.changeListeners) {
      try {
        listener(templateId);
      } catch (err) {
        this.logger.warn(`Listener d'override en erreur pour le template ${templateId}: ${(err as Error).message}`);
      }
    }
  }
}
