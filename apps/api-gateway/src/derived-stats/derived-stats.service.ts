import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DerivedStatDefinition } from './entities/derived-stat-definition.entity';
import {
  DEFAULT_DERIVED_STAT_DEFINITIONS,
  DERIVED_STAT_CATEGORIES,
  PRIMARY_STAT_KEYS,
  RAW_STAT_SOURCES,
  CRITICAL_DERIVED_STAT_KEYS,
  MASTERY_IMPLEMENTED_DERIVED_KEYS,
  PRIMARY_STAT_LABELS,
  isSystemDerivedStat,
} from './derived-stats.constants';
import { UpdateDerivedStatDefinitionDto } from './dto/update-derived-stat-definition.dto';
import { CreateDerivedStatDefinitionDto } from './dto/create-derived-stat-definition.dto';
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
      return;
    }
    await this.seedMissingDefaults();
    await this.demoteLegacyDefensePenetration();
    await this.reconcileImplementedMasteryTargets();
  }

  /**
   * Insère les DerivedStatDefinition système ABSENTES (V4-A). Non destructif :
   * n'insère que les clés par défaut manquantes, n'écrase JAMAIS une ligne
   * existante (système ou custom Studio). Nécessaire pour les bases déjà
   * seedées avant l'ajout d'une nouvelle stat système (ex: armorPenetrationPercent) :
   * `synchronize` crée les colonnes mais ne réinsère aucune ligne. Idempotent.
   */
  private async seedMissingDefaults(): Promise<void> {
    const existing = await this.repo.find({ select: { key: true } });
    const existingKeys = new Set(existing.map((r) => r.key));
    const missing = DEFAULT_DERIVED_STAT_DEFINITIONS.filter((d) => !existingKeys.has(d.key));
    if (missing.length === 0) return;
    await this.repo.save(missing.map((d) => this.repo.create(d)));
    this.invalidateCache();
  }

  /**
   * V4-A : `defensePenetration` (pénétration PLATE, obsolète) est remplacée par
   * `armorPenetrationPercent` (pénétration en %). Sur les bases déjà seedées où
   * la ligne `defensePenetration` existe encore, on la RETIRE des cibles de
   * maîtrise (masteryEligible=false, runtimeStatus='calculatedOnly', aucun mode)
   * pour ne jamais exposer les deux stats en même temps. Non destructif : la
   * ligne est conservée (pas de suppression brutale), simplement dégradée.
   * Idempotent.
   */
  private async demoteLegacyDefensePenetration(): Promise<void> {
    const legacy = await this.repo.findOne({ where: { key: 'defensePenetration' } });
    if (!legacy) return;
    const alreadyDemoted =
      legacy.masteryEligible === false &&
      legacy.runtimeStatus === 'calculatedOnly' &&
      (legacy.allowedModifierModes ?? []).length === 0;
    if (alreadyDemoted) return;
    legacy.masteryEligible = false;
    legacy.runtimeStatus = 'calculatedOnly';
    legacy.allowedModifierModes = [];
    await this.repo.save(legacy);
    this.invalidateCache();
  }

  /**
   * Réconciliation NON DESTRUCTIVE (V3-B) : promeut les 10 dérivées consommées
   * par un hook en cibles de Mastery Effects UNIQUEMENT si elles sont encore
   * dans l'état par défaut V3-A jamais configuré (masteryEligible=false ET
   * runtimeStatus='calculatedOnly' ET aucun mode). N'écrase JAMAIS une valeur
   * éditée depuis le Studio. Nécessaire pour les bases déjà seedées avant V3-B
   * (où `synchronize` ne réapplique pas les defaults). Idempotent.
   */
  private async reconcileImplementedMasteryTargets(): Promise<void> {
    const implementedKeys = new Set<string>(MASTERY_IMPLEMENTED_DERIVED_KEYS);
    const rows = await this.repo.find({
      where: { key: In(MASTERY_IMPLEMENTED_DERIVED_KEYS as unknown as string[]) },
    });
    const toFix = rows.filter(
      (r) =>
        implementedKeys.has(r.key) &&
        r.masteryEligible === false &&
        r.runtimeStatus === 'calculatedOnly' &&
        (r.allowedModifierModes ?? []).length === 0,
    );
    if (toFix.length === 0) return;
    for (const r of toFix) {
      r.masteryEligible = true;
      r.runtimeStatus = 'implemented';
      r.allowedModifierModes = ['percentPerLevel', 'flatPerLevel'];
    }
    await this.repo.save(toFix);
    this.invalidateCache();
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
   * Catalogue read-only pour le panneau joueur (V3-B) : stats principales
   * fixes + dérivées ENABLED (labels serveur). N'expose que ce qui est
   * nécessaire à l'affichage — jamais de coefficients ni de config sensible.
   */
  async getStatCatalogForPlayer(): Promise<{
    primaryStats: { key: string; label: string }[];
    derivedStats: {
      key: string;
      label: string;
      category: string;
      runtimeStatus: string;
      description: string | null;
    }[];
  }> {
    const definitions = await this.getDefinitions();
    return {
      primaryStats: PRIMARY_STAT_LABELS.map((p) => ({ key: p.key, label: p.label })),
      derivedStats: definitions
        .filter((d) => d.enabled)
        .sort((a, b) =>
          a.category !== b.category
            ? a.category.localeCompare(b.category)
            : a.displayOrder - b.displayOrder,
        )
        .map((d) => ({
          key: d.key,
          label: d.label,
          category: d.category,
          runtimeStatus: d.runtimeStatus,
          description: d.description,
        })),
    };
  }

  /** Une définition par sa key. NotFoundException si absente. */
  async getDefinition(key: string): Promise<DerivedStatDefinition> {
    const found = await this.repo.findOne({ where: { key } });
    if (!found) throw new NotFoundException(`Dérivée "${key}" introuvable.`);
    return found;
  }

  /** true si la dérivée est une stat système (seedée, non supprimable). */
  isSystemStat(key: string): boolean {
    return isSystemDerivedStat(key);
  }

  /**
   * Supprime une dérivée CUSTOM (V3 maintenance). Refuse : clé inconnue
   * (404), stat système (400). Ne vérifie PAS les références externes —
   * l'appelant (AdminController) le fait avant via le rapport de références.
   * Auto-suffisant sur la règle système (garde en profondeur).
   */
  async deleteDefinition(key: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { key } });
    if (!existing) throw new NotFoundException(`Dérivée "${key}" introuvable.`);
    if (isSystemDerivedStat(key)) {
      throw new BadRequestException('Stat système non supprimable.');
    }
    await this.repo.remove(existing);
    this.invalidateCache();
  }

  /**
   * Crée une DerivedStatDefinition (Studio « Stats secondaires », V3-A).
   * La key est IMMUABLE après création (PK + nom du champ dans
   * `stats.derived`). Une stat créée ici est CALCULÉE (baseValue +
   * coefficients, clamp min/max) et exposée — mais pas forcément consommée
   * par un hook gameplay (`runtimeStatus` est informatif).
   */
  async createDefinition(dto: CreateDerivedStatDefinitionDto): Promise<DerivedStatDefinition> {
    const existing = await this.repo.findOne({ where: { key: dto.key } });
    if (existing) {
      throw new BadRequestException(`Dérivée "${dto.key}" existe déjà (key immuable).`);
    }
    if (dto.primaryCoefficients !== undefined) {
      this.validatePrimaryCoefficients(dto.primaryCoefficients);
    }
    this.validateMinMax(dto.minValue, dto.maxValue);
    this.validateFiniteNumbers(dto);

    const entity = this.repo.create({
      rawStatSource: null, // réservé aux dérivées combat historiques
      ...dto,
    });
    const saved = await this.repo.save(entity);
    this.invalidateCache();
    return saved;
  }

  private validateMinMax(
    minValue: number | null | undefined,
    maxValue: number | null | undefined,
  ): void {
    if (minValue != null && maxValue != null && minValue > maxValue) {
      throw new BadRequestException('minValue ne peut pas dépasser maxValue.');
    }
  }

  /** Refuse NaN/Infinity sur les champs numériques (défense en profondeur). */
  private validateFiniteNumbers(dto: {
    baseValue?: number;
    minValue?: number | null;
    maxValue?: number | null;
  }): void {
    for (const [field, value] of Object.entries({
      baseValue: dto.baseValue,
      minValue: dto.minValue,
      maxValue: dto.maxValue,
    })) {
      if (value != null && !Number.isFinite(value)) {
        throw new BadRequestException(`${field} doit être un nombre fini.`);
      }
    }
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

    // min/max cohérents en tenant compte des valeurs existantes non patchées.
    this.validateMinMax(
      patch.minValue !== undefined ? patch.minValue : existing.minValue,
      patch.maxValue !== undefined ? patch.maxValue : existing.maxValue,
    );
    this.validateFiniteNumbers(patch);

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
