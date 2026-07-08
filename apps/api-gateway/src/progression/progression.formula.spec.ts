import {
  ProgressionParams,
  xpTierMultiplier,
  xpToReachLevel,
  xpToAdvanceFromLevel,
  cumulativeXpToLevel,
  totalStatPointsForLevel,
  levelFromCumulativeXp,
  experienceIntoCurrentLevel,
  nextLevelXpForLevel,
  resolveCumulativeExperience,
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

  describe('levelFromCumulativeXp', () => {
    it("retourne le niveau 1 pour une XP cumulee nulle ou insuffisante", () => {
      expect(levelFromCumulativeXp(0, params())).toBe(1);
      expect(levelFromCumulativeXp(99, params())).toBe(1);
    });

    it("retourne exactement le niveau dont le seuil cumule est atteint", () => {
      // cumulativeXpToLevel(2)=100 ; (5)=100+200+400+800=1500
      expect(levelFromCumulativeXp(100, params())).toBe(2);
      expect(levelFromCumulativeXp(1500, params())).toBe(5);
      expect(levelFromCumulativeXp(1549, params())).toBe(5);
    });

    it("respecte characterCurrentLevelCap meme avec une XP cumulee tres elevee", () => {
      const p = params({ characterCurrentLevelCap: 3 });
      expect(levelFromCumulativeXp(10_000_000, p)).toBe(3);
    });

    it("respecte characterMaxLevel si le cap courant le depasse (mauvaise config)", () => {
      const p = params({ characterCurrentLevelCap: 999, characterMaxLevel: 4 });
      expect(levelFromCumulativeXp(10_000_000, p)).toBe(4);
    });

    it("est l'inverse coherent de cumulativeXpToLevel (round-trip)", () => {
      const p = params();
      for (const level of [1, 2, 5, 10, 11, 30, 60]) {
        const xp = cumulativeXpToLevel(level, p);
        expect(levelFromCumulativeXp(xp, p)).toBe(level);
      }
    });
  });

  describe('experienceIntoCurrentLevel', () => {
    it("retourne le reste d'XP dans le niveau courant", () => {
      // cumulativeXpToLevel(5)=1500
      expect(experienceIntoCurrentLevel(1550, 5, params())).toBe(50);
    });

    it("retourne l'XP telle quelle au niveau 1 (cumulativeXpToLevel(1)=0)", () => {
      expect(experienceIntoCurrentLevel(50, 1, params())).toBe(50);
    });

    it("ne retourne jamais une valeur negative", () => {
      expect(experienceIntoCurrentLevel(0, 5, params())).toBe(0);
    });
  });

  describe('nextLevelXpForLevel', () => {
    it("equivaut a xpToAdvanceFromLevel sous le cap", () => {
      const p = params();
      expect(nextLevelXpForLevel(1, p)).toBe(xpToAdvanceFromLevel(1, p));
      expect(nextLevelXpForLevel(9, p)).toBe(xpToAdvanceFromLevel(9, p));
    });

    it("retourne 0 au niveau du cap effectif (aucune marche suivante)", () => {
      const p = params({ characterCurrentLevelCap: 10 });
      expect(nextLevelXpForLevel(10, p)).toBe(0);
      expect(nextLevelXpForLevel(11, p)).toBe(0);
    });
  });

  describe('resolveCumulativeExperience', () => {
    it("backfill depuis level/experience si cumulativeExperience est a 0", () => {
      // cumulativeXpToLevel(5)=1500 + experience(50) = 1550
      const character = { level: 5, experience: 50, cumulativeExperience: 0 };
      expect(resolveCumulativeExperience(character, params())).toBe(1550);
    });

    it("ne recalcule jamais si cumulativeExperience est deja > 0", () => {
      const character = { level: 1, experience: 0, cumulativeExperience: 999 };
      expect(resolveCumulativeExperience(character, params())).toBe(999);
    });

    it("un personnage neuf (niveau 1, XP 0) backfill a 0", () => {
      const character = { level: 1, experience: 0, cumulativeExperience: 0 };
      expect(resolveCumulativeExperience(character, params())).toBe(0);
    });
  });
});
