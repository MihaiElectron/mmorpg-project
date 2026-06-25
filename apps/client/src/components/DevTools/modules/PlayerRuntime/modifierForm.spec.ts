// apps/client/src/components/DevTools/modules/PlayerRuntime/modifierForm.spec.ts

import { describe, it, expect } from "vitest";
import {
  validateModifierValue,
  getDebugModifiers,
  formatModifierSummary,
  formatModifierCount,
} from "./modifierForm";
import type { PlayerRuntimeSnapshot, RuntimeModifier } from "./player-runtime.types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeModifier(overrides: Partial<RuntimeModifier> = {}): RuntimeModifier {
  return {
    id: "debug:char-1:1",
    sourceType: "debug",
    sourceLabel: "Debug",
    targetStat: "attackPower",
    operation: "flat",
    value: 10,
    priority: 99,
    enabled: true,
    ...overrides,
  };
}

function makeSnapshot(
  sources: { kind: string; modifiers: RuntimeModifier[] }[],
): PlayerRuntimeSnapshot {
  return {
    characterId: "char-1",
    name: "Hero",
    baseStats: { level: 1, health: 100, maxHealth: 100, attack: 10, defense: 5, experience: 0 },
    derivedStats: { maxHp: 100, attackPower: 10, defenseTotal: 5, speed: 0, gatheringRange: 0, attackRange: 0 },
    sources,
    modifiers: sources.flatMap((s) => s.modifiers),
    trace: { stats: {}, modifierCount: 0, computedAt: "2026-01-01T00:00:00Z" },
    computedAt: "2026-01-01T00:00:00Z",
  };
}

// ─── validateModifierValue ────────────────────────────────────────────────────

describe("validateModifierValue", () => {
  it("parse un entier positif", () => {
    expect(validateModifierValue("10")).toBe(10);
  });

  it("parse un entier négatif", () => {
    expect(validateModifierValue("-5")).toBe(-5);
  });

  it("parse un nombre décimal", () => {
    expect(validateModifierValue("1.5")).toBe(1.5);
  });

  it("parse 0", () => {
    expect(validateModifierValue("0")).toBe(0);
  });

  it("retourne null pour une chaîne vide", () => {
    expect(validateModifierValue("")).toBeNull();
  });

  it("retourne null pour des espaces uniquement", () => {
    expect(validateModifierValue("   ")).toBeNull();
  });

  it("retourne null pour du texte non numérique", () => {
    expect(validateModifierValue("abc")).toBeNull();
  });

  it("retourne null pour NaN", () => {
    expect(validateModifierValue("NaN")).toBeNull();
  });

  it("retourne null pour Infinity", () => {
    expect(validateModifierValue("Infinity")).toBeNull();
  });

  it("parse un grand nombre", () => {
    expect(validateModifierValue("9999")).toBe(9999);
  });
});

// ─── getDebugModifiers ────────────────────────────────────────────────────────

describe("getDebugModifiers", () => {
  it("retourne [] si aucune source debug", () => {
    const snap = makeSnapshot([
      { kind: "equipment", modifiers: [makeModifier({ sourceType: "equipment" })] },
    ]);
    expect(getDebugModifiers(snap)).toEqual([]);
  });

  it("retourne les modifiers de la source debug", () => {
    const m1 = makeModifier({ id: "d1" });
    const m2 = makeModifier({ id: "d2" });
    const snap = makeSnapshot([
      { kind: "equipment", modifiers: [] },
      { kind: "debug", modifiers: [m1, m2] },
    ]);

    const result = getDebugModifiers(snap);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(m1);
    expect(result[1]).toBe(m2);
  });

  it("retourne [] si source debug présente mais vide", () => {
    const snap = makeSnapshot([{ kind: "debug", modifiers: [] }]);
    expect(getDebugModifiers(snap)).toEqual([]);
  });

  it("retourne [] si sources vides", () => {
    const snap = makeSnapshot([]);
    expect(getDebugModifiers(snap)).toEqual([]);
  });

  it("ignore les sources equipment et effect", () => {
    const snap = makeSnapshot([
      { kind: "equipment", modifiers: [makeModifier({ sourceType: "equipment" })] },
      { kind: "effect", modifiers: [makeModifier({ sourceType: "buff" })] },
    ]);
    expect(getDebugModifiers(snap)).toEqual([]);
  });
});

// ─── formatModifierSummary ────────────────────────────────────────────────────

describe("formatModifierSummary", () => {
  it("formate un modifier flat positif avec signe +", () => {
    const mod = makeModifier({ targetStat: "attackPower", operation: "flat", value: 10 });
    expect(formatModifierSummary(mod)).toBe("Attack Power flat +10");
  });

  it("formate un modifier avec valeur négative sans signe +", () => {
    const mod = makeModifier({ targetStat: "defenseTotal", operation: "flat", value: -5 });
    expect(formatModifierSummary(mod)).toBe("Defense Total flat -5");
  });

  it("formate percent_add avec le bon label op", () => {
    const mod = makeModifier({ targetStat: "maxHp", operation: "percent_add", value: 20 });
    expect(formatModifierSummary(mod)).toBe("Max HP %+ +20");
  });

  it("formate percent_multiply", () => {
    const mod = makeModifier({ targetStat: "speed", operation: "percent_multiply", value: 1.5 });
    expect(formatModifierSummary(mod)).toBe("Speed ×% +1.5");
  });

  it("utilise targetStat brut si clé inconnue", () => {
    const mod = makeModifier({ targetStat: "unknownStat" as never, operation: "flat", value: 5 });
    expect(formatModifierSummary(mod)).toBe("unknownStat flat +5");
  });

  it("formate la valeur 0 avec signe +", () => {
    const mod = makeModifier({ value: 0 });
    expect(formatModifierSummary(mod)).toContain("+0");
  });
});

// ─── formatModifierCount ─────────────────────────────────────────────────────

describe("formatModifierCount", () => {
  it("retourne '0 modifiers'", () => {
    expect(formatModifierCount(0)).toBe("0 modifiers");
  });

  it("retourne '1 modifier' au singulier", () => {
    expect(formatModifierCount(1)).toBe("1 modifier");
  });

  it("retourne '2 modifiers' au pluriel", () => {
    expect(formatModifierCount(2)).toBe("2 modifiers");
  });

  it("retourne '10 modifiers'", () => {
    expect(formatModifierCount(10)).toBe("10 modifiers");
  });
});
