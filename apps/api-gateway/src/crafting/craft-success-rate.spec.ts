import { computeCraftSuccessRate } from './craft-success-rate';

function params(overrides: Partial<Parameters<typeof computeCraftSuccessRate>[0]> = {}) {
  return {
    baseSuccessRate: 0.75,
    successBonusPerLevel: 0.02,
    minSuccessRate: 0.05,
    maxSuccessRate: 1.0,
    requiredSkillLevel: 10,
    skillLevel: 10,
    ...overrides,
  };
}

describe('computeCraftSuccessRate', () => {
  it('skill égal au requis : base pure (bonus nul)', () => {
    expect(computeCraftSuccessRate(params({ skillLevel: 10, requiredSkillLevel: 10 }))).toBeCloseTo(0.75, 10);
  });

  it('skill supérieur au requis : bonus par niveau ajouté', () => {
    // 0.75 + (15 - 10) × 0.02 = 0.85
    expect(computeCraftSuccessRate(params({ skillLevel: 15, requiredSkillLevel: 10 }))).toBeCloseTo(0.85, 10);
  });

  it('skill inférieur au requis : bonus négatif appliqué', () => {
    // 0.75 + (5 - 10) × 0.02 = 0.65
    expect(computeCraftSuccessRate(params({ skillLevel: 5, requiredSkillLevel: 10 }))).toBeCloseTo(0.65, 10);
  });

  it('clamp max : ne dépasse jamais maxSuccessRate', () => {
    // 0.9 + (50-1)×0.02 = 1.88 → clampé à 1.0
    expect(
      computeCraftSuccessRate(params({ baseSuccessRate: 0.9, requiredSkillLevel: 1, skillLevel: 50, maxSuccessRate: 1.0 })),
    ).toBe(1.0);
  });

  it('clamp min : ne descend jamais sous minSuccessRate', () => {
    // 0.2 + (1-10)×0.02 = 0.02 → clampé à min 0.5
    expect(
      computeCraftSuccessRate(params({ baseSuccessRate: 0.2, requiredSkillLevel: 10, skillLevel: 1, minSuccessRate: 0.5 })),
    ).toBe(0.5);
  });

  it('bonus nul : reste à la base (clampée)', () => {
    expect(computeCraftSuccessRate(params({ successBonusPerLevel: 0, skillLevel: 99, baseSuccessRate: 0.4 }))).toBe(0.4);
  });
});
