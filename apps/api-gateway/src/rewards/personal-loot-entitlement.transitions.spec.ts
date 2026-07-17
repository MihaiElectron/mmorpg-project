import { PersonalLootEntitlementStatus as S } from './enums/personal-loot-entitlement-status.enum';
import { PersonalLootInvalidTransitionError } from './personal-loot-entitlement.errors';
import {
  evaluateTransition,
  isTransitionAllowed,
} from './personal-loot-entitlement.transitions';

describe("PersonalLootEntitlement transitions (politique pure)", () => {
  describe("transitions autorisées", () => {
    const allowed: Array<[S, S]> = [
      [S.GROUND, S.CLAIMED],
      [S.GROUND, S.MAILED],
      [S.GROUND, S.CANCELLED],
      [S.MAILED, S.CLAIMED],
      [S.MAILED, S.EXPIRED],
      [S.MAILED, S.CANCELLED],
    ];

    it.each(allowed)("autorise %s -> %s", (from, to) => {
      expect(isTransitionAllowed(from, to)).toBe(true);
      expect(evaluateTransition(from, to)).toEqual({ noop: false });
    });
  });

  describe("transitions interdites", () => {
    const forbidden: Array<[S, S]> = [
      [S.MAILED, S.GROUND],
      [S.GROUND, S.EXPIRED],
      [S.CLAIMED, S.GROUND],
      [S.CLAIMED, S.MAILED],
      [S.CLAIMED, S.EXPIRED],
      [S.EXPIRED, S.CLAIMED],
      [S.EXPIRED, S.GROUND],
      [S.EXPIRED, S.MAILED],
      [S.CANCELLED, S.CLAIMED],
      [S.CANCELLED, S.GROUND],
      [S.CANCELLED, S.MAILED],
    ];

    it.each(forbidden)("refuse %s -> %s", (from, to) => {
      expect(isTransitionAllowed(from, to)).toBe(false);
      expect(() => evaluateTransition(from, to)).toThrow(
        PersonalLootInvalidTransitionError,
      );
    });
  });

  describe("retry idempotent (from === to)", () => {
    const all: S[] = [S.GROUND, S.MAILED, S.CLAIMED, S.EXPIRED, S.CANCELLED];

    it.each(all)("retourne noop pour %s -> %s", (status) => {
      expect(evaluateTransition(status, status)).toEqual({ noop: true });
    });

    it("ne considère pas le noop comme une transition autorisée", () => {
      // isTransitionAllowed reste faux (le noop est traité en amont).
      expect(isTransitionAllowed(S.CLAIMED, S.CLAIMED)).toBe(false);
    });
  });
});
