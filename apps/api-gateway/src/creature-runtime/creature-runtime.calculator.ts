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
} from '../player-runtime/player-runtime.types';
import { RuntimeComputeEngine, BaseValueExtractor } from '../player-runtime/runtime-compute';
import { CreatureBaseStats, CreatureCombatStats, CreatureDerivedStats } from './creature-runtime.types';

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
export const CREATURE_DERIVED_BASE: Record<CreatureStatKey, (b: CreatureBaseStats) => number> = {
  // V6-B2 : attackPower/defenseTotal intègrent les primaires (strength/endurance)
  // AVANT l'application des RuntimeModifier, comme une valeur de base composite.
  // maxHp reste = baseHealth : le PV max dérivé (vitality) est CALCULÉ mais NON
  // activé dans ce lot (voir resolveCombatStats.maxHealthDerived).
  maxHp:        (b) => b.baseHealth,
  attackPower:  (b) => b.baseAttack + b.strength * CREATURE_SECONDARY_COEFFICIENTS.attackPowerPerStrength,
  defenseTotal: (b) => b.baseArmor + b.endurance * CREATURE_SECONDARY_COEFFICIENTS.defenseTotalPerEndurance,
  speed:        (b) => b.speedMax,
  attackRange:  () => 0,
};

/**
 * Coefficients de dérivation primaires → secondaires, PROPRES à la créature
 * (V6-B2 Lot 1). Volontairement isolés du catalogue joueur
 * (`DerivedStatDefinition`) : les créatures ne branchent pas le catalogue.
 * Les valeurs reprennent le point de départ joueur mais restent indépendantes.
 *
 * Activation combat de ce lot : `attackPower`/`defenseTotal`/`accuracy`.
 * Calculées mais NON actives en défense : dodge/block/parry/counter, maxHealth.
 */
export const CREATURE_SECONDARY_COEFFICIENTS = {
  /** attackPower += strength × 2 */
  attackPowerPerStrength: 2,
  /** defenseTotal += endurance × 1 */
  defenseTotalPerEndurance: 1,
  /** accuracy += dexterity × 0.5 (additif au flat template) */
  accuracyPerDexterity: 0.5,
  /** dodgeChance = agility × 0.3 (cap) */
  dodgePerAgility: 0.3,
  /** blockChance = endurance × 0.2 + strength × 0.1 (cap) */
  blockPerEndurance: 0.2,
  blockPerStrength: 0.1,
  /** blockReductionPercent constant */
  blockReductionPercent: 25,
  /** parryChance = strength × 0.15 + dexterity × 0.15 (cap) */
  parryPerStrength: 0.15,
  parryPerDexterity: 0.15,
  /** counterAttackPower = dexterity × 0.4 + agility × 0.3 + intelligence × 0.2 */
  counterPerDexterity: 0.4,
  counterPerAgility: 0.3,
  counterPerIntelligence: 0.2,
  /** maxHealthDerived = baseHealth + vitality × 10 (calculé, non activé) */
  maxHealthPerVitality: 10,
  /** Cap commun des chances secondaires (dodge/block/parry) en %. */
  secondaryChanceCap: 40,
} as const;

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
  ): CreatureCombatStats {
    const base = this.calculateBaseStats(creature, template);
    const derived = RuntimeComputeEngine.compute<CreatureDerivedStats>(
      CREATURE_STAT_KEYS,
      (stat) => CREATURE_DERIVED_BASE[stat as CreatureStatKey](base),
      debugModifiers,
    );
    const healingPowerRaw = base.healingPower;
    const c = CREATURE_SECONDARY_COEFFICIENTS;

    // Précision : flat template + dérivation dexterity (activée en combat via
    // creatureCombatStats — réduit l'esquive du joueur défenseur).
    const accuracy = base.accuracy + base.dexterity * c.accuracyPerDexterity;

    // Secondaires défensives : CALCULÉES mais NON actives (canX false).
    const cap = (v: number) => Math.min(v, c.secondaryChanceCap);
    const dodgeChance = cap(base.agility * c.dodgePerAgility);
    const blockChance = cap(base.endurance * c.blockPerEndurance + base.strength * c.blockPerStrength);
    const parryChance = cap(base.strength * c.parryPerStrength + base.dexterity * c.parryPerDexterity);
    const counterAttackPower =
      base.dexterity * c.counterPerDexterity +
      base.agility * c.counterPerAgility +
      base.intelligence * c.counterPerIntelligence;

    // PV max dérivé : calculé pour l'inspection, PAS activé comme PV max runtime.
    const maxHealthDerived = base.baseHealth + base.vitality * c.maxHealthPerVitality;

    return {
      maxHealth: derived.maxHp,
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
      blockReductionPercent: c.blockReductionPercent,
      parryChance,
      counterAttackPower,
      maxHealthDerived,
      canDodge: false,
      canBlock: false,
      canParry: false,
    };
  }
}
