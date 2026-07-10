import { describe, it, expect } from "vitest";
import {
  emptyStatBonusesDraft,
  statBonusesDraftFromItem,
  cleanStatBonuses,
  normalizeRequiredLevel,
  normalizeRequiredClass,
  cleanRequiredMasteries,
  recordsEqual,
} from "./equipmentItemEditor.helpers";

describe("equipmentItemEditor.helpers", () => {
  describe("cleanStatBonuses", () => {
    it("omet les champs vides et 0, garde les valeurs (négatives incluses)", () => {
      const out = cleanStatBonuses({
        strength: "5", vitality: "", agility: "0", intelligence: "-3", wisdom: "abc",
      });
      expect(out).toEqual({ strength: 5, intelligence: -3 });
    });

    it("ignore les clés inconnues", () => {
      expect(cleanStatBonuses({ strength: "2", foo: "9" } as never)).toEqual({ strength: 2 });
    });

    it("draft vide → objet vide", () => {
      expect(cleanStatBonuses(emptyStatBonusesDraft())).toEqual({});
    });
  });

  describe("statBonusesDraftFromItem", () => {
    it("pré-remplit les champs texte depuis l'item, 0/absent → vide", () => {
      const draft = statBonusesDraftFromItem({ strength: 5, agility: 0 });
      expect(draft.strength).toBe("5");
      expect(draft.agility).toBe(""); // 0 → non affiché
      expect(draft.vitality).toBe(""); // absent
    });
  });

  describe("normalizeRequiredLevel", () => {
    it("vide/invalide → 1", () => {
      expect(normalizeRequiredLevel("")).toBe(1);
      expect(normalizeRequiredLevel("abc")).toBe(1);
      expect(normalizeRequiredLevel(0)).toBe(1);
      expect(normalizeRequiredLevel(-5)).toBe(1);
    });
    it("garde un entier >= 1", () => {
      expect(normalizeRequiredLevel("5")).toBe(5);
      expect(normalizeRequiredLevel(12)).toBe(12);
    });
  });

  describe("normalizeRequiredClass", () => {
    it("vide/espaces → null", () => {
      expect(normalizeRequiredClass("")).toBeNull();
      expect(normalizeRequiredClass("   ")).toBeNull();
      expect(normalizeRequiredClass(null)).toBeNull();
    });
    it("trim une valeur non vide", () => {
      expect(normalizeRequiredClass("  guerrier ")).toBe("guerrier");
    });
  });

  describe("cleanRequiredMasteries", () => {
    it("supprime clé vide, valeur <= 0, non entière, non numérique", () => {
      const out = cleanRequiredMasteries({
        woodcutting: 2, "": 3, mining: 0, fishing: -1, herbalism: 1.5,
        cooking: "x" as never,
      });
      expect(out).toEqual({ woodcutting: 2 });
    });
    it("entrée nulle/non-objet → {}", () => {
      expect(cleanRequiredMasteries(null)).toEqual({});
    });
  });

  describe("recordsEqual", () => {
    it("équivalent quel que soit l'ordre des clés", () => {
      expect(recordsEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });
    it("détecte une différence de valeur/clé", () => {
      expect(recordsEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(recordsEqual({ a: 1 }, { a: 1, b: 3 })).toBe(false);
    });
    it("null/undefined ≡ {}", () => {
      expect(recordsEqual(null, {})).toBe(true);
      expect(recordsEqual(undefined, {})).toBe(true);
    });
  });
});
