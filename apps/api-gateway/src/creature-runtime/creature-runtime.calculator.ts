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
  ): CreatureCombatStats {
    const c = coefficients;
    const base = this.calculateBaseStats(creature, template);
    // Base de dérivation construite depuis les coefficients EFFECTIFS (jamais la
    // map figée par défaut) : attackPower/defenseTotal reflètent la config.
    const derivedBase = buildCreatureDerivedBase(c);
    const derived = RuntimeComputeEngine.compute<CreatureDerivedStats>(
      CREATURE_STAT_KEYS,
      (stat) => derivedBase[stat as CreatureStatKey](base),
      debugModifiers,
    );
    const healingPowerRaw = base.healingPower;

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
      // V6-B3 : l'esquive créature est active (défenseur). canDodge sert
      // l'inspector ; l'esquive effective est gérée par le resolver via
      // dodgeChancePercent. block/parry restent inactifs.
      canDodge: dodgeChance > 0,
      canBlock: false,
      canParry: false,
    };
  }
}
