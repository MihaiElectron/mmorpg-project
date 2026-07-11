import { Character } from './entities/character.entity';
import type { DerivedStatDefinition } from '../derived-stats/entities/derived-stat-definition.entity';
import { DEFAULT_DERIVED_STAT_DEFINITIONS } from '../derived-stats/derived-stats.constants';

/**
 * CharacterStatsCalculator — Progression V1
 * -----------------------------------------
 * Calcul PUR (aucune I/O, aucune dépendance injectable) des stats du personnage.
 *
 * Pipeline :
 *   base (points permanents Character) + modifiers → final → derived
 *
 * En V1 :
 *   - `modifiers.equipment` reflète les stats d'équipement déjà persistées sur
 *     Character (`attack` / `defense` au-delà de `baseAttack` / `baseDefense`) ;
 *   - `modifiers.buffs / passives / debuffs` = 0 partout ;
 *   - la STRUCTURE est prête à recevoir équipement / buffs / passifs / debuffs
 *     sans changer le contrat de sortie.
 *
 * Le frontend consomme ce résultat tel quel : il ne recalcule JAMAIS les
 * stats finales ni dérivées.
 *
 * Critique n'est plus une stat primaire distribuable (voir `baseCritical`
 * legacy sur `Character`) : `criticalChance`/`criticalDamage` sont désormais
 * calculées depuis Dextérité/Agilité comme toutes les autres dérivées.
 *
 * Les FORMULES des 24 dérivées ne sont plus hardcodées ici : elles viennent
 * de `DerivedStatDefinition` (config serveur, éditable en DevTools — voir
 * `derived-stats/`). `compute()` reste PUR : il reçoit les définitions en
 * paramètre (chargées par `DerivedStatsService`) et retombe sur
 * `DEFAULT_DERIVED_STAT_DEFINITIONS` (mêmes valeurs que les anciennes
 * constantes hardcodées) si absentes, pour ne jamais planter. Seules
 * `maxHealth`, `physicalAttack` et `defense` sont consommées par le combat
 * (creatures.service.ts) en V1. Toutes les autres dérivées sont calculées et
 * exposées mais restent de l'affichage/preview V1.
 */

/** Les dix stats principales distribuables du personnage. */
export interface PrimaryStats {
  strength: number;
  vitality: number;
  endurance: number;
  agility: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
  spirit: number;
  willpower: number;
  charisma: number;
}

/**
 * Whitelist canonique des clés de stats primaires. Source unique réutilisée pour
 * valider les `statBonuses` d'équipement (Équipement V1-A) et l'agrégation.
 */
export const PRIMARY_STAT_KEYS: readonly (keyof PrimaryStats)[] = [
  'strength',
  'vitality',
  'endurance',
  'agility',
  'dexterity',
  'intelligence',
  'wisdom',
  'spirit',
  'willpower',
  'charisma',
];

/** Stats dérivées calculées à partir des stats finales + stats brutes Character. */
export interface DerivedStats {
  maxHealth: number;
  maxMana: number;
  maxEnergy: number;
  healthRegen: number;
  manaRegen: number;
  energyRegen: number;
  physicalAttack: number;
  magicPower: number;
  healingPower: number;
  armorPenetrationPercent: number;
  defense: number;
  magicalResistanceFire: number;
  magicalResistanceWater: number;
  magicalResistanceAir: number;
  magicalResistanceEarth: number;
  accuracy: number;
  criticalChance: number;
  criticalDamage: number;
  dodgeChance: number;
  parryChance: number;
  blockChance: number;
  attackSpeed: number;
  movementSpeed: number;
  controlResistance: number;
  threatGeneration: number;
}

/**
 * Modificateurs appliqués APRÈS le calcul des dérivées (Mastery Effects V2) :
 * `stat = stat × (1 + percent/100) + flat`, plancher 0, jamais NaN/Infinity.
 * Générique : le calculateur ne sait pas d'où viennent les modificateurs
 * (aujourd'hui : maîtrises via `aggregateMasteryStatModifiers`).
 */
export interface DerivedStatModifiers {
  percent: Record<string, number>;
  flat: Record<string, number>;
}

/** Applique les modificateurs post-dérivées. PURE, défensive, plancher 0. */
export function applyDerivedStatModifiers(
  derived: DerivedStats,
  modifiers: DerivedStatModifiers | null | undefined,
): DerivedStats {
  if (!modifiers) return derived;
  const result = { ...derived } as unknown as Record<string, number>;
  for (const key of Object.keys(result)) {
    const rawPct = modifiers.percent?.[key];
    const rawFlat = modifiers.flat?.[key];
    const pct = typeof rawPct === 'number' && Number.isFinite(rawPct) ? rawPct : 0;
    const flat = typeof rawFlat === 'number' && Number.isFinite(rawFlat) ? rawFlat : 0;
    if (pct === 0 && flat === 0) continue;
    const next = result[key] * (1 + pct / 100) + flat;
    // Défensif : jamais NaN/Infinity ni valeur négative (maxHealth/mana/energy
    // notamment) — une config corrompue ne doit pas casser un consommateur.
    result[key] = Number.isFinite(next) ? Math.max(0, next) : result[key];
  }
  return result as unknown as DerivedStats;
}

/** Contrat de sortie complet exposé par /characters/me. */
export interface CharacterStats {
  base: PrimaryStats;
  modifiers: {
    equipment: PrimaryStats;
    buffs: PrimaryStats;
    passives: PrimaryStats;
    debuffs: PrimaryStats;
  };
  final: PrimaryStats;
  derived: DerivedStats;
}

function zeroPrimary(): PrimaryStats {
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

function sumPrimary(...parts: PrimaryStats[]): PrimaryStats {
  return parts.reduce<PrimaryStats>((acc, p) => ({
    strength: acc.strength + p.strength,
    vitality: acc.vitality + p.vitality,
    endurance: acc.endurance + p.endurance,
    agility: acc.agility + p.agility,
    dexterity: acc.dexterity + p.dexterity,
    intelligence: acc.intelligence + p.intelligence,
    wisdom: acc.wisdom + p.wisdom,
    spirit: acc.spirit + p.spirit,
    willpower: acc.willpower + p.willpower,
    charisma: acc.charisma + p.charisma,
  }), zeroPrimary());
}

/**
 * Calcule les 24 dérivées à partir des stats primaires finales, d'un lot de
 * valeurs brutes Character (pour `rawStatSource`) et d'un jeu de définitions.
 * Fonction PURE réutilisée par `compute()` (personnage réel) et par
 * `DerivedStatsService.previewDerivedStats()` (aperçu admin sans personnage).
 */
export function computeDerivedFromDefinitions(
  final: PrimaryStats,
  rawStats: { maxHealth: number; attack: number; defense: number },
  definitions: DerivedStatDefinition[] | undefined | null,
): DerivedStats {
  const defs = definitions && definitions.length > 0 ? definitions : DEFAULT_DERIVED_STAT_DEFINITIONS;

  const result: Record<string, number> = {};
  for (const d of defs) {
    if (!d.enabled) {
      result[d.key] = 0;
      continue;
    }
    const start = d.rawStatSource
      ? (rawStats as unknown as Record<string, number>)[d.rawStatSource] ?? 0
      : d.baseValue ?? 0;
    let value = start;
    for (const [primaryKey, coef] of Object.entries(d.primaryCoefficients ?? {})) {
      const primaryValue = (final as unknown as Record<string, number>)[primaryKey] ?? 0;
      value += coef * primaryValue;
    }
    if (d.minValue != null) value = Math.max(d.minValue, value);
    if (d.maxValue != null) value = Math.min(d.maxValue, value);
    result[d.key] = value;
  }

  // Garantit le contrat DerivedStats (24 clés) même si la config DB est
  // incomplète (ex: nouvelle dérivée ajoutée au code sans ligne DB seedée) —
  // complète depuis les defaults V1 sans écraser une valeur déjà calculée.
  for (const fallback of DEFAULT_DERIVED_STAT_DEFINITIONS) {
    if (!(fallback.key in result)) result[fallback.key] = 0;
  }

  return result as unknown as DerivedStats;
}

export class CharacterStatsCalculator {
  /** Stats principales de base = points permanents alloués (colonnes base*). */
  static baseStats(character: Character): PrimaryStats {
    // `?? 0` défensif : les colonnes ont un DEFAULT 0 en base, mais un Character
    // partiellement hydraté (projection, fixture) peut ne pas les porter.
    return {
      strength: character.baseStrength ?? 0,
      vitality: character.baseVitality ?? 0,
      endurance: character.baseEndurance ?? 0,
      agility: character.baseAgility ?? 0,
      dexterity: character.baseDexterity ?? 0,
      intelligence: character.baseIntelligence ?? 0,
      wisdom: character.baseWisdom ?? 0,
      spirit: character.baseSpirit ?? 0,
      willpower: character.baseWillpower ?? 0,
      charisma: character.baseCharisma ?? 0,
    };
  }

  /**
   * Calcule le contrat complet base / modifiers / final / derived.
   *
   * En V1 tous les modifiers de stats principales sont à 0 (l'équipement
   * n'octroie pas encore de stats principales ; il agit sur `attack`/`defense`
   * bruts déjà persistés, repris tels quels dans les dérivées).
   *
   * `definitions` : config serveur des formules de dérivées (chargée par
   * `DerivedStatsService.getDefinitions()`). Si omise/vide, retombe sur
   * `DEFAULT_DERIVED_STAT_DEFINITIONS` (mêmes valeurs que l'ancien code
   * hardcodé) — ne plante jamais.
   */
  static compute(
    character: Character,
    definitions?: DerivedStatDefinition[],
    equipmentModifier?: PrimaryStats,
    derivedModifiers?: DerivedStatModifiers | null,
  ): CharacterStats {
    const base = this.baseStats(character);

    // `equipmentModifier` agrégé par l'appelant (helper `aggregateEquipmentBonuses`,
    // point unique). Absent → zéro : comportement identique à avant V1-A. Le
    // calculateur reste PUR (aucune I/O, aucun chargement d'équipement ici).
    const modifiers = {
      equipment: equipmentModifier ?? zeroPrimary(),
      buffs: zeroPrimary(),
      passives: zeroPrimary(),
      debuffs: zeroPrimary(),
    };

    const final = sumPrimary(
      base,
      modifiers.equipment,
      modifiers.buffs,
      modifiers.passives,
      modifiers.debuffs,
    );

    // Modificateurs post-dérivées (Mastery Effects V2) : agrégés par l'appelant
    // (`MasteryEffectsService`), appliqués après les formules. Absent → identique
    // au comportement historique.
    const derived = applyDerivedStatModifiers(
      computeDerivedFromDefinitions(
        final,
        { maxHealth: character.maxHealth, attack: character.attack, defense: character.defense },
        definitions,
      ),
      derivedModifiers,
    );

    return { base, modifiers, final, derived };
  }
}
