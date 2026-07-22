import { describe, it, expect } from "vitest";
import {
  SKILL_DAMAGE_TYPES,
  SKILL_MAGIC_SCHOOLS,
  MAGIC_SCHOOL_LABELS,
} from "./skills.types";
import {
  isMagicDamage,
  isMagicSchool,
  isPhysicalDamage,
  magicSchoolDraftFromSkill,
  magicSchoolValidationError,
  normalizeCanCritForPayload,
  normalizeCombatFlagsForPayload,
  normalizeMagicSchoolForPayload,
  requiresMagicSchool,
  resolveInitialCanCrit,
} from "./skillEditor.helpers";

describe("constantes canoniques (miroir backend)", () => {
  it("SKILL_DAMAGE_TYPES = exactement physical, magic, raw", () => {
    expect([...SKILL_DAMAGE_TYPES]).toEqual(["physical", "magic", "raw"]);
  });

  it("SKILL_MAGIC_SCHOOLS = exactement les 6 écoles canoniques (anti-divergence)", () => {
    expect([...SKILL_MAGIC_SCHOOLS]).toEqual([
      "fire",
      "water",
      "air",
      "earth",
      "sacred",
      "poison",
    ]);
  });

  it("MAGIC_SCHOOL_LABELS couvre exactement les 6 écoles", () => {
    expect(Object.keys(MAGIC_SCHOOL_LABELS).sort()).toEqual([...SKILL_MAGIC_SCHOOLS].sort());
  });
});

describe("requiresMagicSchool", () => {
  it("true seulement pour magic", () => {
    expect(requiresMagicSchool("magic")).toBe(true);
    expect(requiresMagicSchool("physical")).toBe(false);
    expect(requiresMagicSchool("raw")).toBe(false);
  });
});

describe("normalizeMagicSchoolForPayload", () => {
  it("magic + école → école conservée", () => {
    expect(normalizeMagicSchoolForPayload("magic", "air")).toBe("air");
    expect(normalizeMagicSchoolForPayload("magic", "sacred")).toBe("sacred");
  });

  it("magic sans choix (\"\") → null", () => {
    expect(normalizeMagicSchoolForPayload("magic", "")).toBeNull();
  });

  it("physical → null même si une école résiduelle est présente (aucun résidu)", () => {
    expect(normalizeMagicSchoolForPayload("physical", "air")).toBeNull();
  });

  it("raw → null même si une école résiduelle est présente (aucun résidu)", () => {
    expect(normalizeMagicSchoolForPayload("raw", "fire")).toBeNull();
  });
});

describe("magicSchoolValidationError", () => {
  it("magic sans école → message d'erreur", () => {
    expect(magicSchoolValidationError("magic", "")).toMatch(/école magique est requise/i);
  });

  it("magic avec école → aucune erreur", () => {
    expect(magicSchoolValidationError("magic", "air")).toBeNull();
  });

  it("physical / raw → jamais d'erreur d'école", () => {
    expect(magicSchoolValidationError("physical", "")).toBeNull();
    expect(magicSchoolValidationError("raw", "")).toBeNull();
  });
});

describe("magicSchoolDraftFromSkill (chargement)", () => {
  it("école serveur conservée (magic + air → air), aucune conversion", () => {
    expect(magicSchoolDraftFromSkill("air")).toBe("air");
  });

  it("null / undefined → \"\" (non choisie)", () => {
    expect(magicSchoolDraftFromSkill(null)).toBe("");
    expect(magicSchoolDraftFromSkill(undefined)).toBe("");
  });
});

describe("isMagicSchool (garde de type)", () => {
  it("accepte les 6 écoles, rejette le reste", () => {
    for (const s of SKILL_MAGIC_SCHOOLS) expect(isMagicSchool(s)).toBe(true);
    expect(isMagicSchool("lightning")).toBe(false);
    expect(isMagicSchool("")).toBe(false);
  });
});

describe("Critiquable & normalisation des flags combat (miroir serveur)", () => {
  it("isPhysicalDamage / isMagicDamage", () => {
    expect(isPhysicalDamage("damage", "physical")).toBe(true);
    expect(isPhysicalDamage("damage", "magic")).toBe(false);
    expect(isPhysicalDamage("heal", "physical")).toBe(false);
    expect(isMagicDamage("damage", "magic")).toBe(true);
    expect(isMagicDamage("damage", "physical")).toBe(false);
    expect(isMagicDamage("heal", "magic")).toBe(false);
  });

  it("normalizeCanCritForPayload : conservé pour dégâts physiques, false sinon", () => {
    expect(normalizeCanCritForPayload("damage", "physical", true)).toBe(true);
    expect(normalizeCanCritForPayload("damage", "physical", false)).toBe(false);
    expect(normalizeCanCritForPayload("damage", "magic", true)).toBe(false);
    expect(normalizeCanCritForPayload("damage", "raw", true)).toBe(false);
    expect(normalizeCanCritForPayload("heal", "physical", true)).toBe(false);
  });

  it("normalizeCombatFlagsForPayload : magic → défenses magiques verrouillées + canCrit false", () => {
    expect(normalizeCombatFlagsForPayload({
      effectType: "damage", damageType: "magic",
      attackDefenseKind: "physical", canBeBlocked: true, canBeParried: true, canCrit: true,
    })).toEqual({ attackDefenseKind: "magic", canBeBlocked: false, canBeParried: false, canCrit: false });
  });

  it("normalizeCombatFlagsForPayload : physical conserve tout (canCrit inclus)", () => {
    expect(normalizeCombatFlagsForPayload({
      effectType: "damage", damageType: "physical",
      attackDefenseKind: "physical", canBeBlocked: true, canBeParried: false, canCrit: true,
    })).toEqual({ attackDefenseKind: "physical", canBeBlocked: true, canBeParried: false, canCrit: true });
  });

  it("normalizeCombatFlagsForPayload : raw → canCrit false, défenses conservées", () => {
    expect(normalizeCombatFlagsForPayload({
      effectType: "damage", damageType: "raw",
      attackDefenseKind: "physical", canBeBlocked: true, canBeParried: true, canCrit: true,
    })).toEqual({ attackDefenseKind: "physical", canBeBlocked: true, canBeParried: true, canCrit: false });
  });

  it("resolveInitialCanCrit : nouveau skill (null) → true ; skill chargé → sa valeur serveur", () => {
    expect(resolveInitialCanCrit(null)).toBe(true); // nouveau skill physique par défaut
    expect(resolveInitialCanCrit(undefined)).toBe(true);
    expect(resolveInitialCanCrit({ canCrit: false })).toBe(false); // valeur serveur conservée
    expect(resolveInitialCanCrit({ canCrit: true })).toBe(true);
  });
});
