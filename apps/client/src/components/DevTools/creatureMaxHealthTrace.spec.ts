import { describe, it, expect } from "vitest";
import {
  buildMaxHealthRows,
  formatAppliedContribution,
  formatFilteredContribution,
  MaxHealthTrace,
} from "./creatureMaxHealthTrace";

/** Trace serveur type : baseHealth 30, vitality 3, coef 10 → 60 (cap 1, floor). */
function makeTrace(over: Partial<MaxHealthTrace> = {}): MaxHealthTrace {
  return {
    stat: "maxHealth",
    baseValue: 30,
    vitality: 3,
    maxHealthPerVitality: 10,
    appliedContributions: [
      {
        sourceType: "base",
        sourceId: "vitality",
        operation: "flat",
        originalValue: 30,
        effectiveValue: 30,
        scale: 1,
        contribution: 30,
        tags: ["derived", "vitality", "health"],
      },
    ],
    filteredContributions: [],
    afterFlat: 60,
    afterPercentAdd: 60,
    afterPercentMultiply: 60,
    afterOverride: 60,
    beforeCaps: 60,
    caps: { min: 1, max: null },
    afterCaps: 60,
    roundingPolicy: "floor",
    overrideApplied: null,
    finalValue: 60,
    ...over,
  };
}

/** Récupère la valeur d'une ligne par sa clé. */
function rowValue(rows: ReturnType<typeof buildMaxHealthRows>, key: string): string | undefined {
  return rows.find((r) => r.key === key)?.value;
}

describe("buildMaxHealthRows", () => {
  it("1. affiche le socle baseHealth (Base configurée)", () => {
    const rows = buildMaxHealthRows(makeTrace());
    expect(rowValue(rows, "base")).toBe("30");
  });

  it("2. affiche la Vitalité", () => {
    expect(rowValue(buildMaxHealthRows(makeTrace()), "vitality")).toBe("3");
  });

  it("3. affiche le coefficient PV / Vitalité", () => {
    expect(rowValue(buildMaxHealthRows(makeTrace()), "coef")).toBe("10");
  });

  it("4. affiche la contribution Vitalité signée", () => {
    expect(rowValue(buildMaxHealthRows(makeTrace()), "vit-contrib")).toBe("+30");
  });

  it("5. affiche la valeur avant caps", () => {
    expect(rowValue(buildMaxHealthRows(makeTrace()), "before-caps")).toBe("60");
  });

  it("6. affiche le cap minimum", () => {
    expect(rowValue(buildMaxHealthRows(makeTrace()), "cap-min")).toBe("1");
  });

  it("7. affiche la politique d'arrondi", () => {
    expect(rowValue(buildMaxHealthRows(makeTrace()), "rounding")).toBe("floor");
  });

  it("8. met en avant le PV maximum final (strong)", () => {
    const rows = buildMaxHealthRows(makeTrace());
    const final = rows.find((r) => r.key === "final");
    expect(final?.value).toBe("60");
    expect(final?.strong).toBe(true);
  });

  it("9. ne recalcule rien : reprend exactement les valeurs serveur (beforeCaps fractionnaire)", () => {
    const rows = buildMaxHealthRows(makeTrace({ beforeCaps: 37.5, afterFlat: 37.5, afterPercentAdd: 37.5, afterPercentMultiply: 37.5, afterOverride: 37.5, afterCaps: 37, finalValue: 37, maxHealthPerVitality: 2.5, appliedContributions: [{ sourceType: "base", sourceId: "vitality", operation: "flat", originalValue: 7.5, effectiveValue: 7.5, scale: 1, contribution: 7.5, tags: ["derived", "vitality", "health"] }] }));
    expect(rowValue(rows, "before-caps")).toBe("37.5"); // valeur serveur telle quelle
    expect(rowValue(rows, "final")).toBe("37");
  });

  it("10. liste de modificateurs vide → pas de lignes bonus plat/%/multiplicateur superflues", () => {
    const rows = buildMaxHealthRows(makeTrace());
    expect(rows.find((r) => r.key === "flat")).toBeUndefined();
    expect(rows.find((r) => r.key === "pct")).toBeUndefined();
    expect(rows.find((r) => r.key === "mult")).toBeUndefined();
    expect(rows.find((r) => r.key === "override")).toBeUndefined();
  });

  it("affiche les PV actuels si fournis", () => {
    const rows = buildMaxHealthRows(makeTrace(), { currentHealth: 45 });
    expect(rowValue(rows, "current")).toBe("45 / 60");
  });

  it("14. fallback : trace absente → au moins la valeur finale serveur, aucune erreur", () => {
    const rows = buildMaxHealthRows(undefined, { fallbackFinal: 42 });
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("final");
    expect(rows[0].value).toBe("42");
    expect(rows[0].strong).toBe(true);
  });

  it("fallback : trace absente sans finalValue → aucune ligne (pas d'erreur)", () => {
    expect(buildMaxHealthRows(undefined)).toEqual([]);
  });

  it("affiche l'override quand présent", () => {
    const rows = buildMaxHealthRows(
      makeTrace({ overrideApplied: { modifierId: "o", priority: 10, value: 1 }, afterOverride: 1, beforeCaps: 1, afterCaps: 1, finalValue: 1 }),
    );
    expect(rowValue(rows, "override")).toBe("1");
  });
});

describe("formatAppliedContribution (11)", () => {
  it("formate source · opération · valeur signée", () => {
    const s = formatAppliedContribution(makeTrace().appliedContributions[0]);
    expect(s).toContain("vitality");
    expect(s).toContain("flat");
    expect(s).toContain("+30");
  });

  it("mentionne le facteur de réduction si scale ≠ 1", () => {
    const s = formatAppliedContribution({
      sourceType: "equipment", sourceId: "sword", operation: "flat",
      originalValue: 20, effectiveValue: 10, scale: 0.5, contribution: 10, tags: [],
    });
    expect(s).toContain("×0.5");
  });
});

describe("formatFilteredContribution (12)", () => {
  it("affiche une contribution exclue avec sa raison", () => {
    const s = formatFilteredContribution({
      sourceType: "equipment", sourceId: "helmet", operation: "flat",
      originalValue: 15, scale: 0, excluded: true, reasons: ["anti-magie"],
    });
    expect(s).toContain("exclue");
    expect(s).toContain("anti-magie");
  });

  it("affiche une contribution réduite avec son facteur", () => {
    const s = formatFilteredContribution({
      sourceType: "buff", sourceId: "rage", operation: "percent_add",
      originalValue: 20, scale: 0.5, excluded: false, reasons: ["affaiblissement"],
    });
    expect(s).toContain("réduite ×0.5");
    expect(s).toContain("affaiblissement");
  });
});
