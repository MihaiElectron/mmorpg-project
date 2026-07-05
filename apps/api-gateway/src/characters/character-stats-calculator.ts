import { Character } from './entities/character.entity';

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
 */

/** Les huit stats principales du personnage. */
export interface PrimaryStats {
  strength: number;
  vitality: number;
  endurance: number;
  agility: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
  critical: number;
}

/** Stats dérivées calculées à partir des stats finales + stats brutes Character. */
export interface DerivedStats {
  maxHealth: number;
  physicalAttack: number;
  defense: number;
  criticalChance: number;
  criticalDamage: number;
  dodgeChance: number;
  accuracy: number;
  initiative: number;
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
    critical: 0,
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
    critical: acc.critical + p.critical,
  }), zeroPrimary());
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
      critical: character.baseCritical ?? 0,
    };
  }

  /**
   * Calcule le contrat complet base / modifiers / final / derived.
   *
   * En V1 tous les modifiers de stats principales sont à 0 (l'équipement
   * n'octroie pas encore de stats principales ; il agit sur `attack`/`defense`
   * bruts déjà persistés, repris tels quels dans les dérivées).
   */
  static compute(character: Character): CharacterStats {
    const base = this.baseStats(character);

    const modifiers = {
      equipment: zeroPrimary(),
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

    const derived: DerivedStats = {
      // Force / Vitalité / Endurance modifient déjà maxHealth / attaque / défense.
      // `character.maxHealth`, `attack`, `defense` restent la base brute
      // (incluant l'équipement legacy) ; les stats principales s'y ajoutent.
      maxHealth: character.maxHealth + final.vitality * 10,
      physicalAttack: character.attack + final.strength * 2,
      defense: character.defense + final.endurance * 1,
      // Critique / esquive / précision : calculés et exposés, mais NON branchés
      // au combat en V1 (affichage seul).
      criticalChance: Math.min(50, final.critical * 0.5),
      criticalDamage: 150 + final.critical * 1,
      dodgeChance: Math.min(40, final.agility * 0.3),
      accuracy: final.dexterity * 0.5,
      initiative: final.agility + final.dexterity,
    };

    return { base, modifiers, final, derived };
  }
}
