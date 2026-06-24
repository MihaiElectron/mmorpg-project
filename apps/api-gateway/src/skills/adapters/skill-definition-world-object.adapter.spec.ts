import {
  toSkillDefinitionWorldObject,
  SkillDefinitionWorldObject,
} from './skill-definition-world-object.adapter';
import { SkillDefinition } from '../entities/skill-definition.entity';

function makeSd(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
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
  } as SkillDefinition;
}

describe('toSkillDefinitionWorldObject — forme de base', () => {
  it('retourne kind="definition" et category="skill"', () => {
    const wo = toSkillDefinitionWorldObject(makeSd());
    expect(wo.kind).toBe('definition');
    expect(wo.category).toBe('skill');
  });

  it('id et type reflètent id et key de la SkillDefinition', () => {
    const wo = toSkillDefinitionWorldObject(makeSd({ id: 'abc', key: 'mining' }));
    expect(wo.id).toBe('abc');
    expect(wo.type).toBe('mining');
  });

  it("mapId et position sont null (pas d'entité spatiale)", () => {
    const wo = toSkillDefinitionWorldObject(makeSd());
    expect(wo.mapId).toBeNull();
    expect(wo.position).toBeNull();
  });
});

describe('toSkillDefinitionWorldObject — state', () => {
  it('state "enabled" si enabled=true', () => {
    const wo = toSkillDefinitionWorldObject(makeSd({ enabled: true }));
    expect(wo.state).toBe('enabled');
  });

  it('state "disabled" si enabled=false', () => {
    const wo = toSkillDefinitionWorldObject(makeSd({ enabled: false }));
    expect(wo.state).toBe('disabled');
  });
});

describe('toSkillDefinitionWorldObject — capabilities', () => {
  it('expose exactement les 3 capabilities attendues', () => {
    const wo = toSkillDefinitionWorldObject(makeSd());
    const expected: SkillDefinitionWorldObject['capabilities'] = [
      'skill_definition',
      'skill_progression',
      'validation',
    ];
    expect(wo.capabilities).toEqual(expected);
  });

  it('capabilities est frozen', () => {
    const wo = toSkillDefinitionWorldObject(makeSd());
    expect(Object.isFrozen(wo.capabilities)).toBe(true);
  });
});

describe('toSkillDefinitionWorldObject — metadata', () => {
  it('name reflète sd.name', () => {
    const wo = toSkillDefinitionWorldObject(makeSd({ name: 'Mining' }));
    expect(wo.metadata.name).toBe('Mining');
  });

  it('skillCategory reflète sd.category', () => {
    const wo = toSkillDefinitionWorldObject(makeSd({ category: 'combat' }));
    expect(wo.metadata.skillCategory).toBe('combat');
  });

  it('maxLevel, baseXpPerLevel, xpCurveExponent reflétés', () => {
    const wo = toSkillDefinitionWorldObject(makeSd({ maxLevel: 50, baseXpPerLevel: 200, xpCurveExponent: 2.0 }));
    expect(wo.metadata.maxLevel).toBe(50);
    expect(wo.metadata.baseXpPerLevel).toBe(200);
    expect(wo.metadata.xpCurveExponent).toBe(2.0);
  });

  it('createdAt et updatedAt reflétés', () => {
    const d = new Date('2026-06-01T00:00:00Z');
    const wo = toSkillDefinitionWorldObject(makeSd({ createdAt: d, updatedAt: d }));
    expect(wo.metadata.createdAt).toBe(d);
    expect(wo.metadata.updatedAt).toBe(d);
  });

  it('metadata est frozen', () => {
    const wo = toSkillDefinitionWorldObject(makeSd());
    expect(Object.isFrozen(wo.metadata)).toBe(true);
  });
});

describe('toSkillDefinitionWorldObject — immutabilité', () => {
  it('le WorldObject retourné est frozen', () => {
    const wo = toSkillDefinitionWorldObject(makeSd());
    expect(Object.isFrozen(wo)).toBe(true);
  });
});
