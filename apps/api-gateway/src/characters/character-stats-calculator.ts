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
 *
 * Critique n'est plus une stat primaire distribuable (voir `baseCritical`
 * legacy sur `Character`) : `criticalChance`/`criticalDamage` sont désormais
 * calculées depuis Dextérité/Agilité comme toutes les autres dérivées.
 *
 * Seules `maxHealth`, `physicalAttack` et `defense` sont consommées par le
 * combat (creatures.service.ts) en V1. Toutes les autres dérivées sont
 * calculées et exposées mais restent de l'affichage/preview V1 — non
 * branchées à une mécanique (mana/energy/régénération/résistances
 * élémentaires/vitesse/CC n'existent pas encore comme systèmes runtime).
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
      // ── Combat V1 (branché) : Force / Vitalité / Endurance modifient déjà
      // maxHealth / attaque / défense. `character.maxHealth`, `attack`,
      // `defense` restent la base brute (incluant l'équipement legacy) ; les
      // stats principales s'y ajoutent.
      maxHealth: character.maxHealth + final.vitality * 10,
      physicalAttack: character.attack + final.strength * 2,
      defense: character.defense + final.endurance * 1,

      // ── Ressources (affichage/preview V1 — aucun système mana/energy runtime) ──
      maxMana: final.intelligence * 10 + final.wisdom * 5,
      maxEnergy: final.endurance * 8 + final.agility * 2,
      healthRegen: final.vitality * 0.5 + final.endurance * 0.2,
      manaRegen: final.wisdom * 0.5 + final.intelligence * 0.2,
      energyRegen: final.endurance * 0.3 + final.agility * 0.2,

      // ── Puissance magique / soin (affichage/preview V1 — non branché combat) ──
      magicPower: final.intelligence * 2 + final.spirit * 1,
      healingPower: final.wisdom * 2 + final.spirit * 1,

      // ── Résistances élémentaires séparées (affichage/preview V1 — poison/bleed
      // etc. pourront être ajoutées plus tard sans changer ce contrat) ──
      magicalResistanceFire: final.spirit * 0.5 + final.wisdom * 0.2,
      magicalResistanceWater: final.spirit * 0.5 + final.intelligence * 0.2,
      magicalResistanceAir: final.spirit * 0.5 + final.agility * 0.2,
      magicalResistanceEarth: final.spirit * 0.5 + final.endurance * 0.2,

      // ── Précision / critique / esquive (affichage/preview V1 — non branché
      // combat ; criticalChance/criticalDamage ne dépendent plus de Critique,
      // devenu legacy, mais de Dextérité/Agilité) ──
      accuracy: final.dexterity * 0.5,
      criticalChance: Math.min(50, final.dexterity * 0.3 + final.agility * 0.2),
      criticalDamage: 150 + final.dexterity * 1,
      dodgeChance: Math.min(40, final.agility * 0.3),
      parryChance: Math.min(40, final.strength * 0.15 + final.dexterity * 0.15),
      blockChance: Math.min(40, final.endurance * 0.2 + final.strength * 0.1),

      // ── Vitesse (affichage/preview V1 — base 100 = valeur neutre ; la
      // vitesse de déplacement réelle reste une constante serveur globale,
      // voir dette technique STATUS.md "Vitesse joueur") ──
      attackSpeed: 100 + final.agility * 0.3,
      movementSpeed: 100 + final.agility * 0.2,

      // ── Contrôle / aggro (affichage/preview V1 — pas de CC/aggro runtime) ──
      controlResistance: Math.min(50, final.willpower * 0.4),
      threatGeneration: final.charisma * 0.5 + final.strength * 0.3,
    };

    return { base, modifiers, final, derived };
  }
}
