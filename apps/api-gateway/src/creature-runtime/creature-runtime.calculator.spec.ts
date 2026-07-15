import { CreatureRuntimeCalculator } from './creature-runtime.calculator';
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

  it('V6-B1 : les stats primaires ne changent PAS les stats de combat (non branchées)', () => {
    const baseline = CreatureRuntimeCalculator.resolveCombatStats(makeCreature(), makeTemplate());
    const withPrimaries = CreatureRuntimeCalculator.resolveCombatStats(
      makeCreature(),
      makeTemplate({ strength: 100, vitality: 100, endurance: 100, agility: 100, dexterity: 100, intelligence: 100, wisdom: 100, spirit: 100, willpower: 100, charisma: 100 }),
    );
    // attackPower/defenseTotal/maxHealth restent dérivés de baseAttack/baseArmor/baseHealth uniquement.
    expect(withPrimaries.attackPower).toBe(baseline.attackPower);
    expect(withPrimaries.defenseTotal).toBe(baseline.defenseTotal);
    expect(withPrimaries.maxHealth).toBe(baseline.maxHealth);
    expect(withPrimaries.criticalChance).toBe(baseline.criticalChance);
    expect(withPrimaries.canDodge).toBe(false);
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
