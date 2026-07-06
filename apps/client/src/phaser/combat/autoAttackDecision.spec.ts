import { describe, expect, it } from "vitest";
import {
  getAutoAttackRangeDecision,
  DEFAULT_ATTACK_RANGE_WU,
  DEFAULT_SAFETY_MARGIN_WU,
} from "./autoAttackDecision";

describe("getAutoAttackRangeDecision", () => {
  it("range 1280, distance 1024 → attaque sans poursuite", () => {
    const d = getAutoAttackRangeDecision({ distanceWU: 1024, attackRangeWU: 1280 });
    expect(d.canAttack).toBe(true);
    expect(d.shouldChase).toBe(false);
  });

  it("range 1280, distance 1280 (limite exacte) → attaque sans poursuite", () => {
    const d = getAutoAttackRangeDecision({ distanceWU: 1280, attackRangeWU: 1280 });
    expect(d.canAttack).toBe(true);
    expect(d.shouldChase).toBe(false);
  });

  it("range 1280, distance 1281 → poursuite, pas d'attaque", () => {
    const d = getAutoAttackRangeDecision({ distanceWU: 1281, attackRangeWU: 1280 });
    expect(d.canAttack).toBe(false);
    expect(d.shouldChase).toBe(true);
  });

  it("range 4800, distance 3000 → attaque sans poursuite", () => {
    const d = getAutoAttackRangeDecision({ distanceWU: 3000, attackRangeWU: 4800 });
    expect(d.canAttack).toBe(true);
    expect(d.shouldChase).toBe(false);
  });

  it("attackRangeWU absent → fallback 1280 WU", () => {
    const d = getAutoAttackRangeDecision({ distanceWU: 1000, attackRangeWU: undefined });
    expect(d.effectiveRangeWU).toBe(DEFAULT_ATTACK_RANGE_WU);
    expect(d.canAttack).toBe(true);
    expect(d.shouldChase).toBe(false);
  });

  it("attackRangeWU invalide (0 / négatif / NaN) → fallback 1280 WU", () => {
    for (const bad of [0, -100, NaN, null]) {
      const d = getAutoAttackRangeDecision({ distanceWU: 2000, attackRangeWU: bad as number });
      expect(d.effectiveRangeWU).toBe(DEFAULT_ATTACK_RANGE_WU);
      expect(d.shouldChase).toBe(true); // 2000 > 1280
    }
  });

  it("expose stopRangeWU = attackRangeWU - marge (hystérésis)", () => {
    const d = getAutoAttackRangeDecision({ distanceWU: 0, attackRangeWU: 1280 });
    expect(d.stopRangeWU).toBe(1280 - DEFAULT_SAFETY_MARGIN_WU);
  });

  it("marge personnalisée respectée", () => {
    const d = getAutoAttackRangeDecision({ distanceWU: 0, attackRangeWU: 2000, safetyMarginWU: 256 });
    expect(d.stopRangeWU).toBe(1744);
  });
});
