import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DerivedStatDefinition } from './entities/derived-stat-definition.entity';
import {
  DEFAULT_DERIVED_STAT_DEFINITIONS,
  DERIVED_STAT_CATEGORIES,
  PRIMARY_STAT_KEYS,
  RAW_STAT_SOURCES,
  CRITICAL_DERIVED_STAT_KEYS,
} from './derived-stats.constants';
import { UpdateDerivedStatDefinitionDto } from './dto/update-derived-stat-definition.dto';
import { PreviewDerivedStatsDto } from './dto/preview-derived-stats.dto';
import { computeDerivedFromDefinitions, PrimaryStats, DerivedStats } from '../characters/character-stats-calculator';

const CATEGORY_KEYS = new Set(DERIVED_STAT_CATEGORIES.map((c) => c.key));
const PRIMARY_KEY_SET = new Set<string>(PRIMARY_STAT_KEYS);
const RAW_SOURCE_SET = new Set<string>(RAW_STAT_SOURCES);
const CRITICAL_KEY_SET = new Set<string>(CRITICAL_DERIVED_STAT_KEYS);

function zeroPrimaryStats(): PrimaryStats {
  return {
    strength: 0,
    vitality: 0,
    endurance: 0,
    agility: 0,
    dexterity: 0,
    intelligence: 0,
    wisdom: 0,
    spirit: 0,
    willpower: 0,
    charisma: 0,
  };
}

/**
 * DerivedStatsService — source de vérité serveur des formules de calcul des
 * 24 stats dérivées (config éditable en DevTools, remplace les coefficients
 * hardcodés historiques de CharacterStatsCalculator).
 *
 * Cache en mémoire (même pattern que GameConfigService) : invalidé à chaque
 * écriture. Seed au démarrage si la table est vide, avec les valeurs EXACTES
 * de DEFAULT_DERIVED_STAT_DEFINITIONS (aucun changement de gameplay).
 */
@Injectable()
export class DerivedStatsService implements OnModuleInit {
  private cache: DerivedStatDefinition[] | null = null;

  constructor(
    @InjectRepository(DerivedStatDefinition)
    private readonly repo: Repository<DerivedStatDefinition>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.repo.count();
    if (count === 0) {
      const rows = DEFAULT_DERIVED_STAT_DEFINITIONS.map((d) => this.repo.create(d));
      await this.repo.save(rows);
    }
  }

  /** Définitions actives, triées par catégorie puis displayOrder. */
  async getDefinitions(): Promise<DerivedStatDefinition[]> {
    if (this.cache) return this.cache;
    const rows = await this.repo.find();
    this.cache = rows.length > 0 ? rows : DEFAULT_DERIVED_STAT_DEFINITIONS;
    return this.cache;
  }

  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Applique un patch sur UNE définition existante (jamais de création — la
   * liste des 24 clés est fixée par le code, cf. DerivedStats). Valide les
   * clés de primaryCoefficients contre PRIMARY_STAT_KEYS et rejette toute
   * valeur non numérique. Refuse la désactivation des dérivées système
   * critiques (CRITICAL_DERIVED_STAT_KEYS) — leurs coefficients/baseValue/
   * min/max restent librement modifiables.
   */
  async updateDefinition(
    key: string,
    patch: UpdateDerivedStatDefinitionDto,
  ): Promise<DerivedStatDefinition> {
    const existing = await this.repo.findOne({ where: { key } });
    if (!existing) {
      throw new NotFoundException(`Dérivée "${key}" introuvable — création non autorisée.`);
    }

    if (patch.enabled === false && CRITICAL_KEY_SET.has(key)) {
      throw new BadRequestException(
        `"${existing.label}" est une dérivée système requise par le combat et ne peut pas être désactivée.`,
      );
    }

    if (patch.category !== undefined && !CATEGORY_KEYS.has(patch.category)) {
      throw new BadRequestException(`Catégorie "${patch.category}" invalide.`);
    }

    if (patch.primaryCoefficients !== undefined) {
      this.validatePrimaryCoefficients(patch.primaryCoefficients);
    }

    if (
      patch.minValue != null &&
      patch.maxValue != null &&
      patch.minValue > patch.maxValue
    ) {
      throw new BadRequestException('minValue ne peut pas dépasser maxValue.');
    }

    const merged = this.repo.merge(existing, patch);
    const saved = await this.repo.save(merged);
    this.invalidateCache();
    return saved;
  }

  private validatePrimaryCoefficients(coefficients: Record<string, unknown>): void {
    for (const [primaryKey, value] of Object.entries(coefficients)) {
      if (!PRIMARY_KEY_SET.has(primaryKey)) {
        throw new BadRequestException(`Stat primaire "${primaryKey}" inconnue dans primaryCoefficients.`);
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException(`Coefficient non numérique pour "${primaryKey}".`);
      }
    }
  }

  /**
   * Aperçu serveur : calcule les 24 dérivées à partir de stats primaires
   * d'exemple, avec la config persistée OU un brouillon non sauvegardé
   * (draftDefinitions) — l'admin voit l'effet d'un changement avant de
   * l'appliquer. Ne persiste jamais rien.
   */
  async previewDerivedStats(dto: PreviewDerivedStatsDto): Promise<DerivedStats> {
    const primary: PrimaryStats = { ...zeroPrimaryStats(), ...(dto.primaryStats ?? {}) };
    const raw = {
      maxHealth: dto.rawStats?.maxHealth ?? 0,
      attack: dto.rawStats?.attack ?? 0,
      defense: dto.rawStats?.defense ?? 0,
    };

    let definitions: DerivedStatDefinition[];
    if (dto.draftDefinitions && dto.draftDefinitions.length > 0) {
      const current = await this.getDefinitions();
      const byKey = new Map(current.map((d) => [d.key, d]));
      for (const draft of dto.draftDefinitions) {
        const draftKey = draft.key as string;
        if (typeof draftKey !== 'string' || !byKey.has(draftKey)) {
          throw new BadRequestException(`Dérivée "${String(draft.key)}" inconnue dans draftDefinitions.`);
        }
        if (draft.primaryCoefficients) {
          this.validatePrimaryCoefficients(draft.primaryCoefficients as Record<string, unknown>);
        }
        if (draft.rawStatSource != null && !RAW_SOURCE_SET.has(draft.rawStatSource as string)) {
          throw new BadRequestException(`rawStatSource "${draft.rawStatSource}" invalide.`);
        }
        byKey.set(draftKey, { ...byKey.get(draftKey)!, ...draft } as DerivedStatDefinition);
      }
      definitions = Array.from(byKey.values());
    } else {
      definitions = await this.getDefinitions();
    }

    return computeDerivedFromDefinitions(primary, raw, definitions);
  }
}
