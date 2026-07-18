// apps/api-gateway/src/creature-runtime/creature-runtime.calculator.ts
//
// Calculs purs pour le Creature Runtime.
// Aucune I/O, aucune dépendance injectable — méthodes statiques uniquement.

import { Creature } from '../creatures/entities/creature.entity';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import {
  RuntimeModifier,
  RuntimeTrace,
  StatKey,
  StatResolutionResult,
} from '../player-runtime/player-runtime.types';
import { RuntimeComputeEngine, BaseValueExtractor } from '../player-runtime/runtime-compute';
import { CreatureBaseStats, CreatureCombatStats, CreatureDerivedStats } from './creature-runtime.types';
// Type-only : overrides de dérivation PAR TEMPLATE. Import de TYPE uniquement
// (effacé au build) — aucune dépendance runtime vers creature-config, donc
// aucun cycle. Le calculateur reste pur ; l'appelant fournit les overrides.
import type {
  CoefficientMap,
  CreatureTemplateOverrides,
} from '../creature-config/creature-template-overrides.constants';

const CREATURE_PRIMARY_KEYS = [
  'strength', 'vitality', 'endurance', 'agility', 'dexterity',
  'intelligence', 'wisdom', 'spirit', 'willpower', 'charisma',
] as const;

/** Valeurs des 10 primaires du template (défaut 0), indexables par clé. */
function creaturePrimaries(base: CreatureBaseStats): Record<string, number> {
  const b = base as unknown as Record<string, number>;
  const out: Record<string, number> = {};
  for (const k of CREATURE_PRIMARY_KEYS) out[k] = b[k] ?? 0;
  return out;
}

/** `Σ primaire×coef`. Map vide → 0 (aucune contribution primaire). PUR. */
function sumPrimaries(coefMap: CoefficientMap, primaries: Record<string, number>): number {
  let total = 0;
  for (const [pk, coef] of Object.entries(coefMap)) total += (primaries[pk] ?? 0) * coef;
  return total;
}

/** Map effective : override du template si la clé est présente (même vide), sinon fallback. */
function effectiveMap(
  overrides: CreatureTemplateOverrides | undefined,
  derivedStatKey: string,
  fallbackMap: CoefficientMap,
): CoefficientMap {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides.derivedCoefficients, derivedStatKey)) {
    return overrides.derivedCoefficients[derivedStatKey];
  }
  return fallbackMap;
}

/** Scalaire effectif : override du template si présent, sinon fallback global. */
function effectiveScalarValue(
  overrides: CreatureTemplateOverrides | undefined,
  key: string,
  fallbackValue: number,
): number {
  if (overrides && Object.prototype.hasOwnProperty.call(overrides.scalarParams, key)) {
    return overrides.scalarParams[key];
  }
  return fallbackValue;
}

// Stats dérivées calculées pour une créature (sous-ensemble de StatKey).
// gatheringRange est exclu — les créatures ne récoltent pas.
export const CREATURE_STAT_KEYS: StatKey[] = [
  'maxHp',
  'attackPower',
  'defenseTotal',
  'speed',
  'attackRange',
];

export type CreatureStatKey = Extract<
  StatKey,
  'maxHp' | 'attackPower' | 'defenseTotal' | 'speed' | 'attackRange'
>;

/**
 * Mapping des valeurs de base par stat dérivée.
 *
 * Phase 1 — sources :
 *   maxHp        → baseHealth (template)
 *   attackPower  → baseAttack (template)
 *   defenseTotal → baseArmor (template)
 *   speed        → speedMax (template) — vitesse plafond de patrouille
 *   attackRange  → 0 — MELEE_RANGE_WU est une constante dans CreaturesService,
 *                  pas encore exposée dans CreatureTemplate
 */
/**
 * Coefficients de dérivation primaires → secondaires, PROPRES à la créature
 * (V6-B2). Volontairement isolés du catalogue joueur (`DerivedStatDefinition`) :
 * les créatures ne branchent pas le catalogue.
 *
 * V6-B2.5 Lot 1 : ces 14 coefficients deviennent INJECTABLES dans
 * `resolveCombatStats` afin de préparer une configuration serveur (DB + Studio,
 * lots suivants). Le type ci-dessous est le contrat unique ; les valeurs par
 * défaut (`DEFAULT_CREATURE_SECONDARY_COEFFICIENTS`) reproduisent exactement
 * l'équilibrage actuel et servent de fallback code.
 */
export interface CreatureSecondaryCoefficients {
  /** attackPower += strength × coeff (actif en combat). */
  attackPowerPerStrength: number;
  /** defenseTotal += endurance × coeff (actif en combat). */
  defenseTotalPerEndurance: number;
  /** accuracy += dexterity × coeff (additif au flat template, actif en combat). */
  accuracyPerDexterity: number;
  /** dodgeChance = agility × coeff (calculé, non actif). */
  dodgePerAgility: number;
  /** blockChance = endurance × coeff + strength × blockPerStrength (calculé, non actif). */
  blockPerEndurance: number;
  blockPerStrength: number;
  /** Réduction d'un blocage réussi (%) — calculé, non actif. */
  blockReductionPercent: number;
  /** parryChance = strength × coeff + dexterity × parryPerDexterity (calculé, non actif). */
  parryPerStrength: number;
  parryPerDexterity: number;
  /** counterAttackPower = dexterity × coeff + agility × … + intelligence × … (calculé, non actif). */
  counterPerDexterity: number;
  counterPerAgility: number;
  counterPerIntelligence: number;
  /** maxHealthDerived = baseHealth + vitality × coeff (calculé, non activé runtime). */
  maxHealthPerVitality: number;
  /** Cap commun des chances secondaires (dodge/block/parry) en %. */
  secondaryChanceCap: number;
}

/**
 * Valeurs par défaut des coefficients créature = équilibrage V6-B2 actuel.
 * Fallback code utilisé quand `resolveCombatStats` est appelé sans coefficients
 * explicites (et point de départ du futur seed de config serveur).
 */
export const DEFAULT_CREATURE_SECONDARY_COEFFICIENTS: CreatureSecondaryCoefficients = {
  attackPowerPerStrength: 2,
  defenseTotalPerEndurance: 1,
  accuracyPerDexterity: 0.5,
  dodgePerAgility: 0.3,
  blockPerEndurance: 0.2,
  blockPerStrength: 0.1,
  blockReductionPercent: 25,
  parryPerStrength: 0.15,
  parryPerDexterity: 0.15,
  counterPerDexterity: 0.4,
  counterPerAgility: 0.3,
  counterPerIntelligence: 0.2,
  maxHealthPerVitality: 10,
  secondaryChanceCap: 40,
};

/**
 * Construit le mapping `stat dérivée → valeur de base` à partir des coefficients
 * EFFECTIFS (V6-B2.5 Lot 1). `attackPower`/`defenseTotal` intègrent les primaires
 * (strength/endurance) AVANT l'application des RuntimeModifier ; `maxHp` reste
 * `baseHealth` (le PV max dérivé de la vitalité est calculé séparément et NON
 * activé en runtime — voir `resolveCombatStats.maxHealthDerived`).
 */
export function buildCreatureDerivedBase(
  coeffs: CreatureSecondaryCoefficients,
): Record<CreatureStatKey, (b: CreatureBaseStats) => number> {
  return {
    maxHp:        (b) => b.baseHealth,
    attackPower:  (b) => b.baseAttack + b.strength * coeffs.attackPowerPerStrength,
    defenseTotal: (b) => b.baseArmor + b.endurance * coeffs.defenseTotalPerEndurance,
    speed:        (b) => b.speedMax,
    attackRange:  () => 0,
  };
}

/**
 * Mapping par défaut (coefficients par défaut) — conservé pour les chemins hors
 * combat qui n'ont pas encore de config injectée : `calculateWithTrace`
 * (snapshot) et les stats broadcast `toDto`/`resolveEffectiveSpeed` du service.
 * `resolveCombatStats` NE l'utilise plus : il reconstruit sa base depuis les
 * coefficients effectifs.
 */
export const CREATURE_DERIVED_BASE: Record<CreatureStatKey, (b: CreatureBaseStats) => number> =
  buildCreatureDerivedBase(DEFAULT_CREATURE_SECONDARY_COEFFICIENTS);

/**
 * Calculateur du Creature Runtime.
 *
 * Pipeline délégué à RuntimeComputeEngine — identique à PlayerRuntimeCalculator :
 *   CreatureBaseStats → RuntimeModifier[] → CreatureDerivedStats + RuntimeTrace
 *
 * Les constantes CREATURE_STAT_KEYS et CREATURE_DERIVED_BASE sont exportées
 * pour permettre une intégration directe depuis CreaturesService (Phase 2B)
 * sans passer par le service async.
 */
export class CreatureRuntimeCalculator {
  /**
   * Extrait les stats de base depuis une instance Creature + son template.
   */
  static calculateBaseStats(creature: Creature, template: CreatureTemplate): CreatureBaseStats {
    return {
      baseHealth:    template.baseHealth,
      baseArmor:     template.baseArmor,
      baseAttack:    template.baseAttack,
      currentHealth: creature.health,
      speedMin:      template.speedMin,
      speedMax:      template.speedMax,
      // Stats de combat avancées (V5-D2-A) — config brute du template.
      // Défauts sûrs si une colonne est absente (base non migrée) : 0, sauf
      // criticalDamage (150 = ×1.5, inerte tant que criticalChance = 0).
      healingPower:            template.healingPower ?? 0,
      criticalChance:          template.criticalChance ?? 0,
      criticalDamage:          template.criticalDamage ?? 150,
      accuracy:                template.accuracy ?? 0,
      armorPenetrationPercent: template.armorPenetrationPercent ?? 0,
      // Primaires (V6-B1) — défaut 0 si colonne absente (base non migrée).
      strength:     template.strength ?? 0,
      vitality:     template.vitality ?? 0,
      endurance:    template.endurance ?? 0,
      agility:      template.agility ?? 0,
      dexterity:    template.dexterity ?? 0,
      intelligence: template.intelligence ?? 0,
      wisdom:       template.wisdom ?? 0,
      spirit:       template.spirit ?? 0,
      willpower:    template.willpower ?? 0,
      charisma:     template.charisma ?? 0,
    };
  }

  /**
   * Calcule CreatureDerivedStats + RuntimeTrace depuis les stats de base et les modifiers.
   *
   * Sans modifiers (liste vide), retourne les valeurs base sans modification.
   */
  static calculateWithTrace(
    base: CreatureBaseStats,
    modifiers: RuntimeModifier[] = [],
  ): { derived: CreatureDerivedStats; trace: RuntimeTrace } {
    const extract: BaseValueExtractor = (stat) =>
      CREATURE_DERIVED_BASE[stat as CreatureStatKey](base);
    return RuntimeComputeEngine.computeWithTrace<CreatureDerivedStats>(
      CREATURE_STAT_KEYS,
      extract,
      modifiers,
    );
  }

  /**
   * Point UNIQUE des stats de combat effectives d'une créature (V6-A Lot 2).
   * PUR : `debugModifiers` injecté par l'appelant (jamais d'accès registre ici).
   *
   * Reproduit EXACTEMENT le comportement existant, sans changer aucune formule :
   *   - `maxHealth`/`attackPower`/`defenseTotal` via RuntimeComputeEngine
   *     (debug modifiers appliqués comme aujourd'hui) ;
   *   - stats avancées lues brutes du template (via `calculateBaseStats`),
   *     hors canal RuntimeModifier ;
   *   - `healingPowerEffective = raw > 0 ? raw : attackPower` (fallback centralisé,
   *     cohérent avec le cast heal et l'inspector) ;
   *   - `canDodge/canBlock/canParry = false` (limite actuelle figée).
   */
  static resolveCombatStats(
    creature: Creature,
    template: CreatureTemplate,
    debugModifiers: RuntimeModifier[] = [],
    coefficients: CreatureSecondaryCoefficients = DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
    // Lot 2 fix : PV max déjà résolu/mémoïsé fourni par l'appelant (service) pour
    // éviter un recalcul par hit/tick. Absent (appels standalone/tests) → résolu ici.
    precomputedMaxHealth?: number,
    // Overrides de dérivation PAR TEMPLATE (ADR-0021 sous-lot backend). Absent →
    // fallback singleton global (comportement historique STRICTEMENT identique).
    overrides?: CreatureTemplateOverrides,
  ): CreatureCombatStats {
    const c = coefficients;
    const base = this.calculateBaseStats(creature, template);
    const primaries = creaturePrimaries(base);

    // Maps de fallback GLOBALES construites depuis le singleton (aucune copie de
    // valeurs — lit `c.*`). Reflètent EXACTEMENT les formules historiques.
    const gPhysicalAttack: CoefficientMap = { strength: c.attackPowerPerStrength };
    const gDefense: CoefficientMap = { endurance: c.defenseTotalPerEndurance };
    const gAccuracy: CoefficientMap = { dexterity: c.accuracyPerDexterity };
    const gDodge: CoefficientMap = { agility: c.dodgePerAgility };
    const gBlock: CoefficientMap = { endurance: c.blockPerEndurance, strength: c.blockPerStrength };
    const gParry: CoefficientMap = { strength: c.parryPerStrength, dexterity: c.parryPerDexterity };
    const gCounter: CoefficientMap = {
      dexterity: c.counterPerDexterity,
      agility: c.counterPerAgility,
      intelligence: c.counterPerIntelligence,
    };

    // Maps EFFECTIVES : override du template si présent, sinon fallback global.
    const mPhysicalAttack = effectiveMap(overrides, 'physicalAttack', gPhysicalAttack);
    const mDefense = effectiveMap(overrides, 'defense', gDefense);
    const mAccuracy = effectiveMap(overrides, 'accuracy', gAccuracy);
    const mDodge = effectiveMap(overrides, 'dodgeChance', gDodge);
    const mBlock = effectiveMap(overrides, 'blockChance', gBlock);
    const mParry = effectiveMap(overrides, 'parryChance', gParry);
    const mCounter = effectiveMap(overrides, 'counterAttackPower', gCounter);
    const effCap = effectiveScalarValue(overrides, 'secondaryChanceCap', c.secondaryChanceCap);
    const effBlockReduction = effectiveScalarValue(overrides, 'blockReductionPercent', c.blockReductionPercent);

    // attackPower/defenseTotal via le pipeline générique (debug modifiers
    // conservés) : base = baseAttack/baseArmor + Σ primaire×coef effectif.
    const derivedBase: Record<CreatureStatKey, (b: CreatureBaseStats) => number> = {
      maxHp: (b) => b.baseHealth,
      attackPower: (b) => b.baseAttack + sumPrimaries(mPhysicalAttack, creaturePrimaries(b)),
      defenseTotal: (b) => b.baseArmor + sumPrimaries(mDefense, creaturePrimaries(b)),
      speed: (b) => b.speedMax,
      attackRange: () => 0,
    };
    const derived = RuntimeComputeEngine.compute<CreatureDerivedStats>(
      CREATURE_STAT_KEYS,
      (stat) => derivedBase[stat as CreatureStatKey](base),
      debugModifiers,
    );
    const healingPowerRaw = base.healingPower;

    // Précision : flat template + dérivation effective (activée en combat).
    const accuracy = base.accuracy + sumPrimaries(mAccuracy, primaries);

    // Secondaires défensives : CALCULÉES mais NON actives (canX false).
    const cap = (v: number) => Math.min(v, effCap);
    const dodgeChance = cap(sumPrimaries(mDodge, primaries));
    const blockChance = cap(sumPrimaries(mBlock, primaries));
    const parryChance = cap(sumPrimaries(mParry, primaries));
    const counterAttackPower = sumPrimaries(mCounter, primaries);

    // PV max EFFECTIF (Lot 2 — ADR-0021), résolu au point unique. Réutilise la
    // valeur mémoïsée si fournie ; sinon résout avec l'override maxHealth du
    // template (fallback Vitalité sinon).
    const maxHealthOverrideMap =
      overrides && Object.prototype.hasOwnProperty.call(overrides.derivedCoefficients, 'maxHealth')
        ? overrides.derivedCoefficients['maxHealth']
        : null;
    const maxHealth =
      precomputedMaxHealth ??
      CreatureRuntimeCalculator.resolveMaxHealth(template, c, maxHealthOverrideMap).finalValue;

    return {
      maxHealth,
      attackPower: derived.attackPower,
      defenseTotal: derived.defenseTotal,
      healingPowerRaw,
      healingPowerEffective: healingPowerRaw > 0 ? healingPowerRaw : derived.attackPower,
      criticalChance: base.criticalChance,
      criticalDamage: base.criticalDamage,
      accuracy,
      armorPenetrationPercent: base.armorPenetrationPercent,
      dodgeChance,
      blockChance,
      blockReductionPercent: effBlockReduction,
      parryChance,
      counterAttackPower,
      // Alias déprécié (Lot 2) : identique à `maxHealth`. Conservé pour l'inspector
      // et les DTO existants ; ne représente PAS une seconde notion concurrente.
      maxHealthDerived: maxHealth,
      // V6-B3/V6-B4/V6-B6 : parade, esquive puis blocage créature actifs (défenseur).
      // canDodge/canBlock/canParry servent l'inspector ; les effets réels sont gérés
      // par le resolver via dodge/block/parryChancePercent. La parabilité de l'attaque
      // (physical non-raw) est combinée à canParry côté service (isAttackParryable).
      canDodge: dodgeChance > 0,
      canBlock: blockChance > 0 && c.blockReductionPercent > 0,
      canParry: parryChance > 0,
    };
  }

  /**
   * Point UNIQUE de résolution des PV maximum EFFECTIFS d'une créature (Lot 2 —
   * ADR-0021). PUR : délègue au pipeline générique `RuntimeComputeEngine.resolveStat`.
   *
   *   base          = template.baseHealth (socle configuré)
   *   contribution  = vitality × maxHealthPerVitality (flat, tags derived/vitality/health)
   *   cap minimum   = 1
   *   arrondi       = floor (une seule fois, après cap)
   *   → maxHealth autoritaire
   *
   * Aucune formule dupliquée ailleurs : tous les consommateurs (spawn, respawn,
   * soin, fuite, admin, DTO) passent par cette valeur. Les futurs modificateurs
   * (buffs/debuffs/équipement) s'ajouteront comme contributions supplémentaires
   * (non branchés en V1). Les debug modifiers n'affectent PAS le PV max (une seule
   * valeur autoritaire ; ils restent actifs sur attackPower/defenseTotal).
   *
   * Le résultat COMPLET (`StatResolutionResult`) est retourné pour conserver la
   * trace (base, contribution Vitalité, valeur avant cap, cap, politique floor,
   * valeur finale) — prête pour le Studio (Lot 3), sans logique côté client.
   */
  static resolveMaxHealth(
    template: CreatureTemplate,
    coefficients: CreatureSecondaryCoefficients = DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
    // Override de coefficients maxHealth du template (ADR-0021 sous-lot backend).
    // `null`/absent → fallback historique EXACT (contribution Vitalité unique).
    // Présent → contributions par primaire (Σ primaire×coef), map vide → 0.
    maxHealthOverrideMap?: CoefficientMap | null,
  ): StatResolutionResult {
    const baseHealth = template.baseHealth;

    let contributions: RuntimeModifier[];
    if (maxHealthOverrideMap) {
      const primaries = creaturePrimaries(
        CreatureRuntimeCalculator.templatePrimariesAsBase(template),
      );
      contributions = Object.entries(maxHealthOverrideMap).map(([pk, coef]) => ({
        id: `creature:${pk}:maxHp`,
        sourceType: 'base',
        sourceId: pk,
        sourceLabel: pk,
        targetStat: 'maxHp',
        operation: 'flat',
        value: (primaries[pk] ?? 0) * coef,
        priority: 0,
        enabled: true,
        tags: ['derived', pk, 'health'],
        reason: `${pk} ${primaries[pk] ?? 0} × ${coef}`,
      }));
    } else {
      // Fallback historique EXACT — inchangé bit à bit.
      const vitality = template.vitality ?? 0;
      const vitalityBonus = vitality * coefficients.maxHealthPerVitality;
      contributions = [
        {
          id: 'creature:vitality:maxHp',
          sourceType: 'base',
          sourceId: 'vitality',
          sourceLabel: 'Vitalité',
          targetStat: 'maxHp',
          operation: 'flat',
          value: vitalityBonus,
          priority: 0,
          enabled: true,
          tags: ['derived', 'vitality', 'health'],
          reason: `vitality ${vitality} × maxHealthPerVitality ${coefficients.maxHealthPerVitality}`,
        },
      ];
    }

    return RuntimeComputeEngine.resolveStat({
      stat: 'maxHp',
      baseValue: baseHealth,
      contributions,
      caps: { min: 1 },
      rounding: 'floor',
    });
  }

  /** Primaires du template projetées en `CreatureBaseStats` minimal (pour `creaturePrimaries`). */
  private static templatePrimariesAsBase(template: CreatureTemplate): CreatureBaseStats {
    return {
      strength: template.strength ?? 0,
      vitality: template.vitality ?? 0,
      endurance: template.endurance ?? 0,
      agility: template.agility ?? 0,
      dexterity: template.dexterity ?? 0,
      intelligence: template.intelligence ?? 0,
      wisdom: template.wisdom ?? 0,
      spirit: template.spirit ?? 0,
      willpower: template.willpower ?? 0,
      charisma: template.charisma ?? 0,
    } as unknown as CreatureBaseStats;
  }
}
