import { describe, expect, it } from "vitest";
import { hasFormChanges, stableStringify } from "./formDirty";

describe("formDirty.hasFormChanges", () => {
  it("false quand identique", () => {
    expect(hasFormChanges({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(false);
  });

  it("true quand une valeur change", () => {
    expect(hasFormChanges({ a: 1 }, { a: 2 })).toBe(true);
  });

  it("ignore l'ordre des clés (pas de faux positif)", () => {
    expect(hasFormChanges({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
  });

  it("comparaison stable sur objets imbriqués (ex: coefficients réordonnés)", () => {
    const initial = { scaling: { primaryCoefficients: { strength: 2, vitality: 1 } } };
    const current = { scaling: { primaryCoefficients: { vitality: 1, strength: 2 } } };
    expect(hasFormChanges(initial, current)).toBe(false);
  });

  it("détecte l'ajout d'une clé", () => {
    expect(hasFormChanges({ m: {} }, { m: { two_handed: 5 } })).toBe(true);
  });

  it("stableStringify trie récursivement les clés", () => {
    expect(stableStringify({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}');
  });
});
