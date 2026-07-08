import {
  ProgressionParams,
  xpTierMultiplier,
  xpToReachLevel,
  xpToAdvanceFromLevel,
  cumulativeXpToLevel,
  totalStatPointsForLevel,
} from './progression.formula';

function params(overrides: Partial<ProgressionParams> = {}): ProgressionParams {
  return {
    startingXp: 100,
    xpMultiplierLevel1To10: 2,
    xpMultiplierLevel11To30: 1.5,
    xpMultiplierLevel31To60: 1.25,
    xpMultiplierLevel61To120: 1.1,
    characterMaxLevel: 120,
    characterCurrentLevelCap: 60,
    statPointsAtLevelOne: 3,
    statPointsPerLevel: 3,
    ...overrides,
  };
}

describe('progression.formula', () => {
  describe('xpTierMultiplier', () => {
    it("retourne le multiplicateur de la tranche 1-10", () => {
      expect(xpTierMultiplier(5, params())).toBe(2);
      expect(xpTierMultiplier(10, params())).toBe(2);
    });

    it("retourne le multiplicateur de la tranche 11-30", () => {
      expect(xpTierMultiplier(11, params())).toBe(1.5);
      expect(xpTierMultiplier(30, params())).toBe(1.5);
    });

    it("retourne le multiplicateur de la tranche 31-60", () => {
      expect(xpTierMultiplier(31, params())).toBe(1.25);
      expect(xpTierMultiplier(60, params())).toBe(1.25);
    });

    it("retourne le multiplicateur de la tranche 61-120 (et au-dela)", () => {
      expect(xpTierMultiplier(61, params())).toBe(1.1);
      expect(xpTierMultiplier(120, params())).toBe(1.1);
      expect(xpTierMultiplier(500, params())).toBe(1.1);
    });
  });

  describe('xpToReachLevel', () => {
    it("retourne 0 pour le niveau 1 (ou moins)", () => {
      expect(xpToReachLevel(1, params())).toBe(0);
      expect(xpToReachLevel(0, params())).toBe(0);
    });

    it("retourne startingXp pour le niveau 2 (marche 1 -> 2)", () => {
      expect(xpToReachLevel(2, params())).toBe(100);
    });

    it("applique le multiplicateur de tranche a chaque marche suivante", () => {
      // 1->2: 100 (startingXp)
      // 2->3: 100 * 2 (tranche 1-10, niveau cible 3) = 200
      // 3->4: 200 * 2 = 400
      expect(xpToReachLevel(3, params())).toBe(200);
      expect(xpToReachLevel(4, params())).toBe(400);
    });

    it("change de multiplicateur au changement de tranche", () => {
      // niveaux 1..10 : x2 a chaque marche depuis 100
      // 1->2:100, 2->3:200, 3->4:400, ..., 9->10:100*2^8=25600, 10->11:25600*1.5=38400 (tranche 11-30 pour niveau cible 11)
      const p = params();
      const xpTo10 = xpToReachLevel(10, p);
      const xpTo11 = xpToReachLevel(11, p);
      expect(xpTo11).toBe(Math.round(xpTo10 * 1.5));
    });
  });

  describe('xpToAdvanceFromLevel', () => {
    it("equivaut a xpToReachLevel(level + 1)", () => {
      const p = params();
      expect(xpToAdvanceFromLevel(1, p)).toBe(xpToReachLevel(2, p));
      expect(xpToAdvanceFromLevel(9, p)).toBe(xpToReachLevel(10, p));
      expect(xpToAdvanceFromLevel(10, p)).toBe(xpToReachLevel(11, p));
    });
  });

  describe('cumulativeXpToLevel', () => {
    it("retourne 0 pour le niveau 1", () => {
      expect(cumulativeXpToLevel(1, params())).toBe(0);
    });

    it("cumule les marches successives", () => {
      const p = params();
      // 1->2:100, 2->3:200, 3->4:400 => cumul niveau 4 = 700
      expect(cumulativeXpToLevel(4, p)).toBe(100 + 200 + 400);
    });

    it("est coherente avec la somme des xpToReachLevel", () => {
      const p = params({ characterMaxLevel: 15 });
      let expected = 0;
      for (let lvl = 2; lvl <= 12; lvl++) expected += xpToReachLevel(lvl, p);
      expect(cumulativeXpToLevel(12, p)).toBe(expected);
    });
  });

  describe('totalStatPointsForLevel', () => {
    it("retourne les points du niveau 1", () => {
      expect(totalStatPointsForLevel(1, params())).toBe(3);
    });

    it("cumule les points par niveau", () => {
      expect(totalStatPointsForLevel(60, params())).toBe(3 + 59 * 3);
      expect(totalStatPointsForLevel(120, params())).toBe(3 + 119 * 3);
    });

    it("borne au niveau 1 minimum", () => {
      expect(totalStatPointsForLevel(0, params())).toBe(3);
    });
  });
});
