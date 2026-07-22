import { describe, it, expect } from "vitest";
import {
  SKILL_DAMAGE_TYPES,
  SKILL_MAGIC_SCHOOLS,
  MAGIC_SCHOOL_LABELS,
} from "./skills.types";
import {
  isMagicSchool,
  magicSchoolDraftFromSkill,
  magicSchoolValidationError,
  normalizeMagicSchoolForPayload,
  requiresMagicSchool,
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
