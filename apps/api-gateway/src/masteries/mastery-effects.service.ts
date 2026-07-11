import { Injectable } from '@nestjs/common';
import { MasteriesService } from './masteries.service';
import {
  AggregatedStatModifiers,
  aggregateMasteryStatModifiers,
  CombatMasteryContext,
  CombatMasteryEffectsResult,
  computeCombatMasteryEffects,
  emptyAggregatedStatModifiers,
  MasteryEffectsDefinitionLike,
} from './mastery-effects.calculator';
import { MasteryEffectTarget } from './mastery-effect-targets';

/** Bonus complets d'un personnage : permanents (stats) + contextuels (combat). */
export interface CharacterMasteryBonuses {
  /** Modificateurs permanents par stat — à passer à `CharacterStatsCalculator.compute`. */
  statModifiers: AggregatedStatModifiers;
  /** Bonus contextuel weapon-based (0 si pas de weaponType). */
  combat: CombatMasteryEffectsResult;
}

/**
 * MasteryEffectsService (Mastery Effects V2) — point d'entrée serveur UNIQUE
 * pour les effets de maîtrises. Les calculs sont délégués aux fonctions pures
 * (`computeCombatMasteryEffects`, `aggregateMasteryStatModifiers`) ; ce
 * service ne fait que charger les données.
 *
 * Définitions servies par le cache mémoire de
 * `MasteriesService.getEnabledMasteryDefinitions()` (invalidé sur CRUD) ;
 * seuls les niveaux du personnage sont lus en DB.
 */
@Injectable()
export class MasteryEffectsService {
  constructor(private readonly masteriesService: MasteriesService) {}

  private async loadDefinitionsAndLevels(characterId: string): Promise<{
    definitions: MasteryEffectsDefinitionLike[];
    levels: Record<string, number>;
    targets: MasteryEffectTarget[];
  }> {
    const [definitions, masteryRows, targets] = await Promise.all([
      this.masteriesService.getEnabledMasteryDefinitions(),
      this.masteriesService.getCharacterMasteries(characterId),
      this.masteriesService.getMasteryEffectTargets(),
    ]);
    const levels: Record<string, number> = {};
    for (const row of masteryRows) levels[row.key] = row.level;
    return { definitions, levels, targets };
  }

  /** Targets d'effets (V3-B) — façade vers MasteriesService (source dérivées). */
  async getEffectTargets(): Promise<MasteryEffectTarget[]> {
    return this.masteriesService.getMasteryEffectTargets();
  }

  /**
   * Bonus complets d'un personnage en un seul chargement (attaque : stats
   * permanentes + bonus d'arme contextuel).
   */
  async getMasteryBonuses(
    characterId: string,
    context: CombatMasteryContext,
  ): Promise<CharacterMasteryBonuses> {
    const { definitions, levels, targets } = await this.loadDefinitionsAndLevels(characterId);
    return {
      statModifiers: aggregateMasteryStatModifiers(definitions, levels, targets),
      combat: computeCombatMasteryEffects(definitions, levels, context, targets),
    };
  }

  /**
   * Modificateurs permanents seuls (getMe, respawn, join, regen, allocation,
   * mirror admin…). Zéro contexte d'arme.
   */
  async getPermanentStatModifiers(characterId: string): Promise<AggregatedStatModifiers> {
    const { definitions, levels, targets } = await this.loadDefinitionsAndLevels(characterId);
    return aggregateMasteryStatModifiers(definitions, levels, targets);
  }

  /**
   * Bonus combat contextuel seul (compat V1 — préférer `getMasteryBonuses`
   * quand les stats permanentes sont aussi nécessaires).
   * Sans weaponType : court-circuit sans aucune lecture DB.
   */
  async getCombatMasteryEffects(
    characterId: string,
    context: CombatMasteryContext,
  ): Promise<CombatMasteryEffectsResult> {
    if (!context?.weaponType) return { damagePercent: 0, damageFlat: 0 };
    const { definitions, levels, targets } = await this.loadDefinitionsAndLevels(characterId);
    return computeCombatMasteryEffects(definitions, levels, context, targets);
  }

  // ── Variantes pour appelants ayant DÉJÀ définitions + niveaux (skill-cast) ──
  // Les targets sont chargés en interne (caches mémoire DerivedStatsService) —
  // asynchrones depuis V3-B, mais toujours zéro lecture DB supplémentaire à
  // caches chauds.

  /** Bonus combat contextuel (definitions/levels fournis par l'appelant). */
  async computeCombatEffects(
    definitions: readonly MasteryEffectsDefinitionLike[],
    masteryLevels: Record<string, number>,
    context: CombatMasteryContext,
  ): Promise<CombatMasteryEffectsResult> {
    const targets = await this.masteriesService.getMasteryEffectTargets();
    return computeCombatMasteryEffects(definitions, masteryLevels, context, targets);
  }

  /** Modificateurs permanents par stat (definitions/levels fournis). */
  async aggregatePermanentModifiers(
    definitions: readonly MasteryEffectsDefinitionLike[],
    masteryLevels: Record<string, number>,
  ): Promise<AggregatedStatModifiers> {
    const targets = await this.masteriesService.getMasteryEffectTargets();
    return aggregateMasteryStatModifiers(definitions, masteryLevels, targets);
  }

  /** Agrégat vide — pour les chemins sans maîtrise (création de personnage…). */
  emptyStatModifiers(): AggregatedStatModifiers {
    return emptyAggregatedStatModifiers();
  }
}
