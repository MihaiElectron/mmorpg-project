import {
  CreatureRuntimeCalculator,
  DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
  CreatureSecondaryCoefficients,
} from './creature-runtime.calculator';
import { Creature } from '../creatures/entities/creature.entity';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import { RuntimeModifier } from '../player-runtime/player-runtime.types';

function makeTemplate(overrides: Partial<CreatureTemplate> = {}): CreatureTemplate {
  return {
    id: 1,
    key: 'turkey',
    name: 'Turkey',
    textureKey: 'turkey',
    baseHealth: 80,
    baseArmor: 5,
    baseAttack: 12,
    patrolRadius: 3000,
    speedMin: 200,
    speedMax: 400,
    pauseMinMs: 500,
    pauseMaxMs: 3000,
    aggroRadius: 2000,
    fleeThresholdPct: 25,
    respawnDelayMs: 20000,
    lootPool: null,
    killCharacterXpReward: 0,
    healingPower: 0,
    criticalChance: 0,
    criticalDamage: 150,
    accuracy: 0,
    armorPenetrationPercent: 0,
    // V6-B1 : primaires (fondation de données, non branchées au combat).
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
    ...overrides,
  } as CreatureTemplate;
}

function makeCreature(health = 80): Creature {
  return { id: 'creature-1', health, state: 'alive' } as Creature;
}

/** Modifier debug `flat` sur une stat runtime créature (attackPower/defenseTotal…). */
function flatMod(targetStat: string, value: number): RuntimeModifier {
  return {
    id: `debug:${targetStat}`,
    sourceType: 'debuff',
    sourceId: 'debug',
    sourceLabel: 'Debug',
    targetStat: targetStat as RuntimeModifier['targetStat'],
    operation: 'flat',
    value,
    priority: 0,
    enabled: true,
  };
}

describe('CreatureRuntimeCalculator.resolveCombatStats (V6-A Lot 2)', () => {
  it('attackPower = baseAttack, defenseTotal = baseArmor, maxHealth = baseHealth', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(makeCreature(), makeTemplate());
    expect(s.attackPower).toBe(12);
    expect(s.defenseTotal).toBe(5);
    expect(s.maxHealth).toBe(80);
  });

  it('healingPowerEffective = healingPower si > 0', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(makeCreature(), makeTemplate({ healingPower: 30 }));
    expect(s.healingPowerRaw).toBe(30);
    expect(s.healingPowerEffective).toBe(30);
  });

  it('healingPowerEffective = attackPower si healingPower = 0 (fallback)', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(makeCreature(), makeTemplate({ healingPower: 0, baseAttack: 12 }));
    expect(s.healingPowerRaw).toBe(0);
    expect(s.healingPowerEffective).toBe(12); // = attackPower
  });

  it('critical/accuracy/armorPen remontent depuis le template', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(),
      makeTemplate({ criticalChance: 25, criticalDamage: 200, accuracy: 10, armorPenetrationPercent: 40 }),
    );
    expect(s.criticalChance).toBe(25);
    expect(s.criticalDamage).toBe(200);
    expect(s.accuracy).toBe(10);
    expect(s.armorPenetrationPercent).toBe(40);
  });

  it('canDodge/canBlock/canParry sont false (limite créature défenseur)', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(makeCreature(), makeTemplate());
    expect(s.canDodge).toBe(false);
    expect(s.canBlock).toBe(false);
    expect(s.canParry).toBe(false);
  });

  it('debug modifier flat sur attackPower modifie attackPower', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(makeCreature(), makeTemplate(), [flatMod('attackPower', 8)]);
    expect(s.attackPower).toBe(20); // 12 + 8
  });

  it('debug modifier flat sur defenseTotal modifie defenseTotal', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(makeCreature(), makeTemplate(), [flatMod('defenseTotal', 3)]);
    expect(s.defenseTotal).toBe(8); // 5 + 3
  });

  it('fallback healingPower tient compte de l\'attackPower modifié par debug', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(),
      makeTemplate({ healingPower: 0, baseAttack: 12 }),
      [flatMod('attackPower', 8)],
    );
    expect(s.attackPower).toBe(20);
    expect(s.healingPowerEffective).toBe(20); // fallback sur attackPower modifié
  });
});

describe('CreatureRuntimeCalculator — dérivation primaires → secondaires (V6-B2 Lot 1)', () => {
  const resolve = (o: Partial<CreatureTemplate> = {}) =>
    CreatureRuntimeCalculator.resolveCombatStats(makeCreature(), makeTemplate(o));

  it('primaires à 0 → comportement identique à avant', () => {
    const s = resolve();
    expect(s.attackPower).toBe(12); // baseAttack
    expect(s.defenseTotal).toBe(5); // baseArmor
    expect(s.accuracy).toBe(0); // flat template
    expect(s.dodgeChance).toBe(0);
    expect(s.blockChance).toBe(0);
    expect(s.parryChance).toBe(0);
    expect(s.counterAttackPower).toBe(0);
    expect(s.maxHealth).toBe(80); // baseHealth, non dérivé
  });

  it('strength augmente attackPower (+ strength × 2)', () => {
    const s = resolve({ strength: 10 });
    expect(s.attackPower).toBe(12 + 10 * 2); // 32
  });

  it('endurance augmente defenseTotal (+ endurance × 1)', () => {
    const s = resolve({ endurance: 7 });
    expect(s.defenseTotal).toBe(5 + 7); // 12
  });

  it('dexterity augmente accuracy en additif avec accuracy flat (+ dexterity × 0.5)', () => {
    const s = resolve({ accuracy: 10, dexterity: 8 });
    expect(s.accuracy).toBe(10 + 8 * 0.5); // 14
  });

  it('healingPower = 0 → fallback sur attackPower dérivé (avec strength)', () => {
    const s = resolve({ healingPower: 0, strength: 10 });
    expect(s.attackPower).toBe(32);
    expect(s.healingPowerRaw).toBe(0);
    expect(s.healingPowerEffective).toBe(32); // fallback sur attackPower dérivé
  });

  it('healingPower > 0 garde la valeur configurée', () => {
    const s = resolve({ healingPower: 25, strength: 10 });
    expect(s.healingPowerEffective).toBe(25);
  });

  it('agility calcule dodgeChance (× 0.3) et canDodge devient true (V6-B3)', () => {
    const s = resolve({ agility: 50 });
    expect(s.dodgeChance).toBe(50 * 0.3); // 15
    expect(s.canDodge).toBe(true); // dodgeChance > 0
  });

  it('endurance + strength calculent blockChance et canBlock devient true (V6-B4)', () => {
    const s = resolve({ endurance: 30, strength: 20 });
    expect(s.blockChance).toBe(30 * 0.2 + 20 * 0.1); // 8
    // blockChance > 0 et blockReductionPercent (25) > 0 → canBlock true.
    expect(s.canBlock).toBe(true);
  });

  it('blockReductionPercent vaut 25', () => {
    expect(resolve({ endurance: 30 }).blockReductionPercent).toBe(25);
    expect(resolve().blockReductionPercent).toBe(25);
  });

  it('strength + dexterity calculent parryChance et canParry devient true (V6-B6)', () => {
    const s = resolve({ strength: 40, dexterity: 40 });
    expect(s.parryChance).toBe(40 * 0.15 + 40 * 0.15); // 12
    expect(s.canParry).toBe(true); // parryChance > 0
  });

  it('V6-B6 : canParry false si parryChance = 0', () => {
    const s = resolve({ strength: 0, dexterity: 0 });
    expect(s.parryChance).toBe(0);
    expect(s.canParry).toBe(false);
  });

  it('counterAttackPower est calculé (dex × 0.4 + agi × 0.3 + int × 0.2)', () => {
    const s = resolve({ dexterity: 10, agility: 10, intelligence: 10 });
    expect(s.counterAttackPower).toBeCloseTo(10 * 0.4 + 10 * 0.3 + 10 * 0.2); // 9
  });

  it('caps dodge/block/parry à 40', () => {
    const s = resolve({
      agility: 1000, // dodge brut 300
      endurance: 1000, // block brut 200+…
      strength: 1000,
      dexterity: 1000, // parry brut 150+150
    });
    expect(s.dodgeChance).toBe(40);
    expect(s.blockChance).toBe(40);
    expect(s.parryChance).toBe(40);
  });

  it('criticalChance / criticalDamage / armorPenetrationPercent restent flat (non dérivés)', () => {
    const s = resolve({
      criticalChance: 25,
      criticalDamage: 200,
      armorPenetrationPercent: 40,
      // primaires élevées : ne doivent pas toucher ces stats flat
      strength: 100,
      dexterity: 100,
      intelligence: 100,
      wisdom: 100,
    });
    expect(s.criticalChance).toBe(25);
    expect(s.criticalDamage).toBe(200);
    expect(s.armorPenetrationPercent).toBe(40);
  });

  it('maxHealthDerived est calculé (baseHealth + vitality × 10) sans activer maxHealth runtime', () => {
    const s = resolve({ vitality: 5 });
    expect(s.maxHealthDerived).toBe(80 + 5 * 10); // 130
    expect(s.maxHealth).toBe(80); // PV max runtime NON rebranché
  });

  it('spirit/willpower/charisma/wisdom n\'ont aucun effet combat (non branchées)', () => {
    const baseline = resolve();
    const s = resolve({ spirit: 100, willpower: 100, charisma: 100, wisdom: 100 });
    expect(s.attackPower).toBe(baseline.attackPower);
    expect(s.defenseTotal).toBe(baseline.defenseTotal);
    expect(s.accuracy).toBe(baseline.accuracy);
    expect(s.dodgeChance).toBe(baseline.dodgeChance);
    expect(s.blockChance).toBe(baseline.blockChance);
    expect(s.parryChance).toBe(baseline.parryChance);
    expect(s.maxHealth).toBe(baseline.maxHealth);
  });
});

describe('CreatureRuntimeCalculator — coefficients injectables (V6-B2.5 Lot 1)', () => {
  // Primaires non nulles pour exercer chaque coefficient.
  const PRIMS: Partial<CreatureTemplate> = {
    strength: 10, vitality: 5, endurance: 7, agility: 8, dexterity: 12, intelligence: 6,
  };

  /** Coefficients custom = défauts + overrides ponctuels. */
  const withCoeffs = (over: Partial<CreatureSecondaryCoefficients>): CreatureSecondaryCoefficients => ({
    ...DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
    ...over,
  });

  it('sans coefficients explicites → résultats identiques aux valeurs par défaut', () => {
    const withoutArg = CreatureRuntimeCalculator.resolveCombatStats(makeCreature(), makeTemplate(PRIMS));
    const withDefault = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(),
      makeTemplate(PRIMS),
      [],
      DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
    );
    expect(withoutArg).toEqual(withDefault);
    // Valeurs de référence (équilibrage V6-B2 inchangé).
    expect(withoutArg.attackPower).toBe(12 + 10 * 2); // baseAttack 12 + strength 10 × 2 = 32
    expect(withoutArg.defenseTotal).toBe(5 + 7 * 1); // baseArmor 5 + endurance 7 × 1 = 12
    expect(withoutArg.accuracy).toBe(0 + 12 * 0.5); // 6
  });

  it('attackPowerPerStrength custom → attackPower change comme attendu', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(), makeTemplate(PRIMS), [], withCoeffs({ attackPowerPerStrength: 5 }),
    );
    expect(s.attackPower).toBe(12 + 10 * 5); // 62
  });

  it('defenseTotalPerEndurance custom → defenseTotal change comme attendu', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(), makeTemplate(PRIMS), [], withCoeffs({ defenseTotalPerEndurance: 3 }),
    );
    expect(s.defenseTotal).toBe(5 + 7 * 3); // 26
  });

  it('accuracyPerDexterity custom → accuracy change comme attendu', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(), makeTemplate({ ...PRIMS, accuracy: 4 }), [], withCoeffs({ accuracyPerDexterity: 2 }),
    );
    expect(s.accuracy).toBe(4 + 12 * 2); // 28
  });

  it('dodge/block/parry/counter/maxHealth custom → valeurs calculées changent comme attendu', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(), makeTemplate(PRIMS), [],
      withCoeffs({
        dodgePerAgility: 1,
        blockPerEndurance: 1, blockPerStrength: 0.5,
        parryPerStrength: 1, parryPerDexterity: 0.5,
        counterPerDexterity: 1, counterPerAgility: 0.5, counterPerIntelligence: 0.25,
        blockReductionPercent: 40,
        maxHealthPerVitality: 20,
        secondaryChanceCap: 100, // pour ne pas capper ces valeurs custom
      }),
    );
    expect(s.dodgeChance).toBe(8 * 1); // agility 8
    expect(s.blockChance).toBe(7 * 1 + 10 * 0.5); // 12
    expect(s.parryChance).toBe(10 * 1 + 12 * 0.5); // 16
    expect(s.counterAttackPower).toBeCloseTo(12 * 1 + 8 * 0.5 + 6 * 0.25); // 17.5
    expect(s.blockReductionPercent).toBe(40);
    expect(s.maxHealthDerived).toBe(80 + 5 * 20); // 180
  });

  it('secondaryChanceCap custom est respecté (dodge/block/parry cappés)', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(),
      makeTemplate({ strength: 1000, endurance: 1000, agility: 1000, dexterity: 1000 }),
      [],
      withCoeffs({ secondaryChanceCap: 10 }),
    );
    expect(s.dodgeChance).toBe(10);
    expect(s.blockChance).toBe(10);
    expect(s.parryChance).toBe(10);
  });

  it('V6-B3/V6-B4/V6-B6 : dodge/block/parry > 0 → canDodge/canBlock/canParry true', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(), makeTemplate(PRIMS), [],
      withCoeffs({ dodgePerAgility: 5, blockPerEndurance: 5, parryPerStrength: 5, secondaryChanceCap: 100 }),
    );
    expect(s.dodgeChance).toBeGreaterThan(0);
    expect(s.canDodge).toBe(true);
    // V6-B4 : blocage actif (blockChance > 0 et réduction 25 > 0).
    expect(s.blockChance).toBeGreaterThan(0);
    expect(s.canBlock).toBe(true);
    // V6-B6 : parade active (parryChance > 0).
    expect(s.parryChance).toBeGreaterThan(0);
    expect(s.canParry).toBe(true);
  });

  it('V6-B4 : canBlock false si blockChance = 0', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(), makeTemplate({ endurance: 0, strength: 0 }), [], DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
    );
    expect(s.blockChance).toBe(0);
    expect(s.canBlock).toBe(false);
  });

  it('V6-B4 : canBlock false si blockReductionPercent = 0 (même si blockChance > 0)', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(), makeTemplate({ endurance: 30 }), [],
      withCoeffs({ blockReductionPercent: 0 }),
    );
    expect(s.blockChance).toBeGreaterThan(0);
    expect(s.blockReductionPercent).toBe(0);
    expect(s.canBlock).toBe(false);
  });

  it('V6-B3 : dodgeChance = 0 → canDodge false', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(), makeTemplate({ agility: 0 }), [], DEFAULT_CREATURE_SECONDARY_COEFFICIENTS,
    );
    expect(s.dodgeChance).toBe(0);
    expect(s.canDodge).toBe(false);
  });

  it('maxHealthDerived custom reste informatif : maxHealth actif = baseHealth', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(), makeTemplate({ vitality: 50 }), [], withCoeffs({ maxHealthPerVitality: 30 }),
    );
    expect(s.maxHealthDerived).toBe(80 + 50 * 30); // 1580
    expect(s.maxHealth).toBe(80); // PV max runtime NON rebranché
  });

  it('debug modifiers restent appliqués APRÈS la dérivation par coefficients', () => {
    const s = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(), makeTemplate(PRIMS), [flatMod('attackPower', 8)], withCoeffs({ attackPowerPerStrength: 5 }),
    );
    expect(s.attackPower).toBe(12 + 10 * 5 + 8); // 70
  });
});
