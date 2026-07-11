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

  private async loadDefinitionsAndLevels(
    characterId: string,
  ): Promise<{ definitions: MasteryEffectsDefinitionLike[]; levels: Record<string, number> }> {
    const [definitions, masteryRows] = await Promise.all([
      this.masteriesService.getEnabledMasteryDefinitions(),
      this.masteriesService.getCharacterMasteries(characterId),
    ]);
    const levels: Record<string, number> = {};
    for (const row of masteryRows) levels[row.key] = row.level;
    return { definitions, levels };
  }

  /**
   * Bonus complets d'un personnage en un seul chargement (attaque : stats
   * permanentes + bonus d'arme contextuel).
   */
  async getMasteryBonuses(
    characterId: string,
    context: CombatMasteryContext,
  ): Promise<CharacterMasteryBonuses> {
    const { definitions, levels } = await this.loadDefinitionsAndLevels(characterId);
    return {
      statModifiers: aggregateMasteryStatModifiers(definitions, levels),
      combat: computeCombatMasteryEffects(definitions, levels, context),
    };
  }

  /**
   * Modificateurs permanents seuls (getMe, respawn, join, regen, allocation,
   * mirror admin…). Zéro contexte d'arme.
   */
  async getPermanentStatModifiers(characterId: string): Promise<AggregatedStatModifiers> {
    const { definitions, levels } = await this.loadDefinitionsAndLevels(characterId);
    return aggregateMasteryStatModifiers(definitions, levels);
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
    const { definitions, levels } = await this.loadDefinitionsAndLevels(characterId);
    return computeCombatMasteryEffects(definitions, levels, context);
  }

  // ── Variantes sans I/O (définitions + niveaux déjà chargés par l'appelant) ──

  /** Façade pure — bonus combat contextuel. */
  computeCombatEffects(
    definitions: readonly MasteryEffectsDefinitionLike[],
    masteryLevels: Record<string, number>,
    context: CombatMasteryContext,
  ): CombatMasteryEffectsResult {
    return computeCombatMasteryEffects(definitions, masteryLevels, context);
  }

  /** Façade pure — modificateurs permanents par stat. */
  aggregatePermanentModifiers(
    definitions: readonly MasteryEffectsDefinitionLike[],
    masteryLevels: Record<string, number>,
  ): AggregatedStatModifiers {
    return aggregateMasteryStatModifiers(definitions, masteryLevels);
  }

  /** Agrégat vide — pour les chemins sans maîtrise (création de personnage…). */
  emptyStatModifiers(): AggregatedStatModifiers {
    return emptyAggregatedStatModifiers();
  }
}
