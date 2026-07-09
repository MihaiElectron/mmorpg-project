import {
  toMasteryDefinitionWorldObject,
  MasteryDefinitionWorldObject,
} from './mastery-definition-world-object.adapter';
import { MasteryDefinition } from '../entities/mastery-definition.entity';

function makeSd(overrides: Partial<MasteryDefinition> = {}): MasteryDefinition {
  return {
    id: 'def-uuid-1',
    key: 'woodcutting',
    name: 'Woodcutting',
    category: 'gathering',
    maxLevel: 100,
    baseXpPerLevel: 100,
    xpCurveExponent: 1.5,
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as MasteryDefinition;
}

describe('toMasteryDefinitionWorldObject — forme de base', () => {
  it('retourne kind="definition" et category="mastery"', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd());
    expect(wo.kind).toBe('definition');
    expect(wo.category).toBe('mastery');
  });

  it('id et type reflètent id et key de la MasteryDefinition', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd({ id: 'abc', key: 'mining' }));
    expect(wo.id).toBe('abc');
    expect(wo.type).toBe('mining');
  });

  it("mapId et position sont null (pas d'entité spatiale)", () => {
    const wo = toMasteryDefinitionWorldObject(makeSd());
    expect(wo.mapId).toBeNull();
    expect(wo.position).toBeNull();
  });
});

describe('toMasteryDefinitionWorldObject — state', () => {
  it('state "enabled" si enabled=true', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd({ enabled: true }));
    expect(wo.state).toBe('enabled');
  });

  it('state "disabled" si enabled=false', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd({ enabled: false }));
    expect(wo.state).toBe('disabled');
  });
});

describe('toMasteryDefinitionWorldObject — capabilities', () => {
  it('expose exactement les 3 capabilities attendues', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd());
    const expected: MasteryDefinitionWorldObject['capabilities'] = [
      'mastery_definition',
      'mastery_progression',
      'validation',
    ];
    expect(wo.capabilities).toEqual(expected);
  });

  it('capabilities est frozen', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd());
    expect(Object.isFrozen(wo.capabilities)).toBe(true);
  });
});

describe('toMasteryDefinitionWorldObject — metadata', () => {
  it('name reflète sd.name', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd({ name: 'Mining' }));
    expect(wo.metadata.name).toBe('Mining');
  });

  it('masteryCategory reflète sd.category', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd({ category: 'combat' }));
    expect(wo.metadata.masteryCategory).toBe('combat');
  });

  it('maxLevel, baseXpPerLevel, xpCurveExponent reflétés', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd({ maxLevel: 50, baseXpPerLevel: 200, xpCurveExponent: 2.0 }));
    expect(wo.metadata.maxLevel).toBe(50);
    expect(wo.metadata.baseXpPerLevel).toBe(200);
    expect(wo.metadata.xpCurveExponent).toBe(2.0);
  });

  it('createdAt et updatedAt reflétés', () => {
    const d = new Date('2026-06-01T00:00:00Z');
    const wo = toMasteryDefinitionWorldObject(makeSd({ createdAt: d, updatedAt: d }));
    expect(wo.metadata.createdAt).toBe(d);
    expect(wo.metadata.updatedAt).toBe(d);
  });

  it('metadata est frozen', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd());
    expect(Object.isFrozen(wo.metadata)).toBe(true);
  });
});

describe('toMasteryDefinitionWorldObject — immutabilité', () => {
  it('le WorldObject retourné est frozen', () => {
    const wo = toMasteryDefinitionWorldObject(makeSd());
    expect(Object.isFrozen(wo)).toBe(true);
  });
});
