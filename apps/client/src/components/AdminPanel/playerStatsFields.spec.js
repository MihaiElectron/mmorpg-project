import { describe, it, expect } from "vitest";
import {
  PLAYER_PROGRESSION_FIELDS,
  PLAYER_PRIMARY_STAT_FIELDS,
  PLAYER_COMBAT_FIELDS,
  PLAYER_EDITABLE_FIELDS,
  PLAYER_DERIVED_ROWS,
  formatDerived,
} from "./playerStatsFields";

const DERIVED_KEYS = PLAYER_DERIVED_ROWS.map((r) => r.key);
const EDITABLE_KEYS = PLAYER_EDITABLE_FIELDS.map((f) => f.key);

describe("playerStatsFields", () => {
  it("regroupe progression + principales + combat dans les champs éditables", () => {
    expect(PLAYER_EDITABLE_FIELDS).toHaveLength(
      PLAYER_PROGRESSION_FIELDS.length +
        PLAYER_PRIMARY_STAT_FIELDS.length +
        PLAYER_COMBAT_FIELDS.length,
    );
  });

  it("expose les 8 stats principales base*", () => {
    expect(PLAYER_PRIMARY_STAT_FIELDS.map((f) => f.key)).toEqual([
      "baseStrength", "baseVitality", "baseEndurance", "baseAgility",
      "baseDexterity", "baseIntelligence", "baseWisdom", "baseCritical",
    ]);
  });

  it("inclut experience et unspentStatPoints dans les champs éditables", () => {
    expect(EDITABLE_KEYS).toContain("experience");
    expect(EDITABLE_KEYS).toContain("unspentStatPoints");
  });

  it("n'inclut AUCUNE stat dérivée dans les champs éditables", () => {
    // physicalAttack, criticalChance… ne doivent jamais partir dans le payload.
    const derivedOnly = ["physicalAttack", "criticalChance", "criticalDamage", "dodgeChance", "accuracy", "initiative"];
    for (const key of derivedOnly) {
      expect(EDITABLE_KEYS).not.toContain(key);
    }
  });

  it("les clés dérivées et éditables ne se recouvrent pas (hors valeurs brutes homonymes)", () => {
    // maxHealth / defense existent en brut (éditable) ET en dérivé (lecture seule),
    // mais les dérivées calculées pures ne sont jamais éditables.
    const pureDerived = DERIVED_KEYS.filter((k) => k !== "maxHealth" && k !== "defense");
    for (const k of pureDerived) {
      expect(EDITABLE_KEYS).not.toContain(k);
    }
  });

  it("formatDerived arrondit et ajoute le suffixe, gère les valeurs absentes", () => {
    expect(formatDerived(140)).toBe("140");
    expect(formatDerived(12.34, "%")).toBe("12.3%");
    expect(formatDerived(undefined)).toBe("—");
    expect(formatDerived(NaN)).toBe("—");
  });
});
