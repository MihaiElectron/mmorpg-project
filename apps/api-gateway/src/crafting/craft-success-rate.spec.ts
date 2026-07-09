import { computeCraftSuccessRate } from './craft-success-rate';

function params(overrides: Partial<Parameters<typeof computeCraftSuccessRate>[0]> = {}) {
  return {
    baseSuccessRate: 0.75,
    successBonusPerLevel: 0.02,
    minSuccessRate: 0.05,
    maxSuccessRate: 1.0,
    requiredMasteryLevel: 10,
    masteryLevel: 10,
    ...overrides,
  };
}

describe('computeCraftSuccessRate', () => {
  it('mastery égal au requis : base pure (bonus nul)', () => {
    expect(computeCraftSuccessRate(params({ masteryLevel: 10, requiredMasteryLevel: 10 }))).toBeCloseTo(0.75, 10);
  });

  it('mastery supérieur au requis : bonus par niveau ajouté', () => {
    // 0.75 + (15 - 10) × 0.02 = 0.85
    expect(computeCraftSuccessRate(params({ masteryLevel: 15, requiredMasteryLevel: 10 }))).toBeCloseTo(0.85, 10);
  });

  it('mastery inférieur au requis : bonus négatif appliqué', () => {
    // 0.75 + (5 - 10) × 0.02 = 0.65
    expect(computeCraftSuccessRate(params({ masteryLevel: 5, requiredMasteryLevel: 10 }))).toBeCloseTo(0.65, 10);
  });

  it('clamp max : ne dépasse jamais maxSuccessRate', () => {
    // 0.9 + (50-1)×0.02 = 1.88 → clampé à 1.0
    expect(
      computeCraftSuccessRate(params({ baseSuccessRate: 0.9, requiredMasteryLevel: 1, masteryLevel: 50, maxSuccessRate: 1.0 })),
    ).toBe(1.0);
  });

  it('clamp min : ne descend jamais sous minSuccessRate', () => {
    // 0.2 + (1-10)×0.02 = 0.02 → clampé à min 0.5
    expect(
      computeCraftSuccessRate(params({ baseSuccessRate: 0.2, requiredMasteryLevel: 10, masteryLevel: 1, minSuccessRate: 0.5 })),
    ).toBe(0.5);
  });

  it('bonus nul : reste à la base (clampée)', () => {
    expect(computeCraftSuccessRate(params({ successBonusPerLevel: 0, masteryLevel: 99, baseSuccessRate: 0.4 }))).toBe(0.4);
  });
});
