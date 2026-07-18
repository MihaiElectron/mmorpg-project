import {
  CreatureRuntimeCalculator,
  DEFAULT_CREATURE_SECONDARY_COEFFICIENTS as G,
} from './creature-runtime.calculator';
import { Creature } from '../creatures/entities/creature.entity';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import {
  CreatureTemplateOverrides,
  EMPTY_TEMPLATE_OVERRIDES,
} from '../creature-config/creature-template-overrides.constants';

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
    strength: 10,
    vitality: 8,
    endurance: 6,
    agility: 4,
    dexterity: 5,
    intelligence: 3,
    wisdom: 0,
    spirit: 0,
    willpower: 0,
    charisma: 0,
    ...overrides,
  } as CreatureTemplate;
}

function makeCreature(health = 80): Creature {
  return { id: 'c1', health } as Creature;
}

function overrides(partial: Partial<CreatureTemplateOverrides>): CreatureTemplateOverrides {
  return {
    derivedCoefficients: partial.derivedCoefficients ?? {},
    scalarParams: partial.scalarParams ?? {},
  };
}

describe("resolveCombatStats — overrides par template (préservation + branchement)", () => {
  const creature = makeCreature();

  it("SANS override : identique bit à bit au chemin sans argument overrides", () => {
    const template = makeTemplate();
    const baseline = CreatureRuntimeCalculator.resolveCombatStats(creature, template, [], G);
    const withEmpty = CreatureRuntimeCalculator.resolveCombatStats(
      creature,
      template,
      [],
      G,
      undefined,
      EMPTY_TEMPLATE_OVERRIDES,
    );
    expect(withEmpty).toEqual(baseline);
  });

  it("SANS override : valeurs historiques exactes (attaque/défense/accuracy/dodge/block/parry/counter/blockReduction)", () => {
    const t = makeTemplate();
    const s = CreatureRuntimeCalculator.resolveCombatStats(creature, t, [], G);
    // Formules historiques : baseAttack + str×2, baseArmor + end×1, etc.
    expect(s.attackPower).toBe(12 + 10 * G.attackPowerPerStrength); // 32
    expect(s.defenseTotal).toBe(5 + 6 * G.defenseTotalPerEndurance); // 11
    expect(s.accuracy).toBe(0 + 5 * G.accuracyPerDexterity); // 2.5
    expect(s.dodgeChance).toBe(Math.min(4 * G.dodgePerAgility, G.secondaryChanceCap));
    expect(s.blockChance).toBe(
      Math.min(6 * G.blockPerEndurance + 10 * G.blockPerStrength, G.secondaryChanceCap),
    );
    expect(s.parryChance).toBe(
      Math.min(10 * G.parryPerStrength + 5 * G.parryPerDexterity, G.secondaryChanceCap),
    );
    expect(s.counterAttackPower).toBe(
      5 * G.counterPerDexterity + 4 * G.counterPerAgility + 3 * G.counterPerIntelligence,
    );
    expect(s.blockReductionPercent).toBe(G.blockReductionPercent);
  });

  it("override physicalAttack : la map du template REMPLACE la globale", () => {
    const t = makeTemplate();
    const ov = overrides({ derivedCoefficients: { physicalAttack: { strength: 3.5 } } });
    const s = CreatureRuntimeCalculator.resolveCombatStats(creature, t, [], G, undefined, ov);
    expect(s.attackPower).toBe(12 + 10 * 3.5); // 47
  });

  it("override multi-primaires : toutes les contributions additionnées", () => {
    const t = makeTemplate();
    const ov = overrides({
      derivedCoefficients: { physicalAttack: { strength: 2, agility: 1, dexterity: 0.5 } },
    });
    const s = CreatureRuntimeCalculator.resolveCombatStats(creature, t, [], G, undefined, ov);
    expect(s.attackPower).toBe(12 + 10 * 2 + 4 * 1 + 5 * 0.5); // 12+20+4+2.5 = 38.5
  });

  it("override coefficient NÉGATIF : contribution négative préservée", () => {
    const t = makeTemplate();
    const ov = overrides({ derivedCoefficients: { defense: { endurance: -0.5 } } });
    const s = CreatureRuntimeCalculator.resolveCombatStats(creature, t, [], G, undefined, ov);
    expect(s.defenseTotal).toBe(5 + 6 * -0.5); // 2
  });

  it("override MAP VIDE volontaire : zéro contribution primaire (base seule)", () => {
    const t = makeTemplate();
    const ov = overrides({ derivedCoefficients: { physicalAttack: {} } });
    const s = CreatureRuntimeCalculator.resolveCombatStats(creature, t, [], G, undefined, ov);
    expect(s.attackPower).toBe(12); // baseAttack seule, aucune dérivation
  });

  it("override scalaire secondaryChanceCap : plafond du template appliqué", () => {
    const t = makeTemplate({ agility: 1000 });
    const ov = overrides({ scalarParams: { secondaryChanceCap: 75 } });
    const s = CreatureRuntimeCalculator.resolveCombatStats(creature, t, [], G, undefined, ov);
    expect(s.dodgeChance).toBe(75); // cap override, pas 40
  });

  it("override scalaire blockReductionPercent : valeur du template", () => {
    const t = makeTemplate();
    const ov = overrides({ scalarParams: { blockReductionPercent: 60 } });
    const s = CreatureRuntimeCalculator.resolveCombatStats(creature, t, [], G, undefined, ov);
    expect(s.blockReductionPercent).toBe(60);
  });

  it("isolation : deux templates avec overrides différents ne s'influencent pas", () => {
    const turkey = makeTemplate({ id: 1, key: 'turkey' });
    const wolf = makeTemplate({ id: 2, key: 'wolf' });
    const ovTurkey = overrides({ derivedCoefficients: { physicalAttack: { strength: 2 } } });
    const ovWolf = overrides({ derivedCoefficients: { physicalAttack: { strength: 3.5 } } });
    const sT = CreatureRuntimeCalculator.resolveCombatStats(creature, turkey, [], G, undefined, ovTurkey);
    const sW = CreatureRuntimeCalculator.resolveCombatStats(creature, wolf, [], G, undefined, ovWolf);
    expect(sT.attackPower).toBe(12 + 10 * 2); // 32
    expect(sW.attackPower).toBe(12 + 10 * 3.5); // 47
  });
});

describe("resolveMaxHealth — override par template", () => {
  it("SANS override : identique au fallback Vitalité historique", () => {
    const t = makeTemplate({ vitality: 8 });
    const baseline = CreatureRuntimeCalculator.resolveMaxHealth(t, G);
    const withNull = CreatureRuntimeCalculator.resolveMaxHealth(t, G, null);
    expect(withNull.finalValue).toBe(baseline.finalValue);
    expect(baseline.finalValue).toBe(80 + 8 * G.maxHealthPerVitality); // 160
  });

  it("override maxHealth : coefficient Vitalité du template remplace la globale", () => {
    const t = makeTemplate({ vitality: 8 });
    const r = CreatureRuntimeCalculator.resolveMaxHealth(t, G, { vitality: 25 });
    expect(r.finalValue).toBe(80 + 8 * 25); // 280
  });

  it("override maxHealth multi-primaires", () => {
    const t = makeTemplate({ vitality: 8, endurance: 6 });
    const r = CreatureRuntimeCalculator.resolveMaxHealth(t, G, { vitality: 10, endurance: 5 });
    expect(r.finalValue).toBe(80 + 8 * 10 + 6 * 5); // 190
  });

  it("override maxHealth map vide : PV max = baseHealth seul", () => {
    const t = makeTemplate({ vitality: 8, baseHealth: 100 });
    const r = CreatureRuntimeCalculator.resolveMaxHealth(t, G, {});
    expect(r.finalValue).toBe(100);
  });

  it("deux templates : maxHealth différent par override", () => {
    const a = makeTemplate({ id: 1, key: 'a', vitality: 10, baseHealth: 50 });
    const b = makeTemplate({ id: 2, key: 'b', vitality: 10, baseHealth: 50 });
    const ra = CreatureRuntimeCalculator.resolveMaxHealth(a, G, { vitality: 2 });
    const rb = CreatureRuntimeCalculator.resolveMaxHealth(b, G, { vitality: 20 });
    expect(ra.finalValue).toBe(50 + 10 * 2); // 70
    expect(rb.finalValue).toBe(50 + 10 * 20); // 250
  });
});
