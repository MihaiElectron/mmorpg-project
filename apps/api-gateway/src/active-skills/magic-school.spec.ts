import { readFileSync } from 'fs';
import { join } from 'path';
import {
  checkCanonicalSkillCoherence,
  checkMagicSchoolCoherence,
  isMagicSchoolValue,
  normalizeSkillCombatFlags,
  resolveEffectiveCanCrit,
  SKILL_MAGIC_SCHOOLS,
} from './active-skills.constants';

describe("MagicSchool — vocabulaire fermé (ADR-0022, lot fondation)", () => {
  it("expose exactement les six écoles autorisées", () => {
    expect([...SKILL_MAGIC_SCHOOLS]).toEqual([
      "fire",
      "water",
      "air",
      "earth",
      "sacred",
      "poison",
    ]);
  });

  it("ne contient aucune école générique", () => {
    for (const generic of ["magic", "arcane", "generic", "none", "all"]) {
      expect((SKILL_MAGIC_SCHOOLS as readonly string[]).includes(generic)).toBe(
        false,
      );
    }
  });

  describe("isMagicSchoolValue", () => {
    it.each([...SKILL_MAGIC_SCHOOLS])("accepte %s", (school) => {
      expect(isMagicSchoolValue(school)).toBe(true);
    });

    it.each(["magic", "arcane", "", "FIRE", null, undefined, 3])(
      "rejette %p",
      (value) => {
        expect(isMagicSchoolValue(value)).toBe(false);
      },
    );
  });
});

describe("checkMagicSchoolCoherence — école ↔ nature défensive", () => {
  it("accepte un skill physical sans école (null)", () => {
    expect(checkMagicSchoolCoherence("physical", null)).toBeNull();
  });

  it("accepte un skill magic avec une école (sacred)", () => {
    expect(checkMagicSchoolCoherence("magic", "sacred")).toBeNull();
  });

  it.each(SKILL_MAGIC_SCHOOLS)(
    "accepte un skill magic avec l'école %s",
    (school) => {
      expect(checkMagicSchoolCoherence("magic", school)).toBeNull();
    },
  );

  it("refuse une école sur un skill physical", () => {
    expect(checkMagicSchoolCoherence("physical", "fire")).toBe(
      "magic_school_forbidden_for_physical",
    );
  });

  it("refuse un skill magic sans école", () => {
    expect(checkMagicSchoolCoherence("magic", null)).toBe(
      "magic_school_required_for_magic",
    );
  });

  it("refuse une valeur d'école inconnue", () => {
    expect(
      checkMagicSchoolCoherence(
        "magic",
        "arcane" as unknown as (typeof SKILL_MAGIC_SCHOOLS)[number],
      ),
    ).toBe("magic_school_invalid");
  });
});

describe("checkCanonicalSkillCoherence — verrou heal = magic + sacred", () => {
  it("accepte heal + magic + sacred", () => {
    expect(checkCanonicalSkillCoherence("heal", "magic", "sacred")).toBeNull();
  });

  it("refuse heal avec une autre école", () => {
    for (const school of ["fire", "water", "air", "earth", "poison"] as const) {
      expect(checkCanonicalSkillCoherence("heal", "magic", school)).toBe(
        "canonical_skill_magic_school_mismatch",
      );
    }
  });

  it("refuse heal + magic + null", () => {
    expect(checkCanonicalSkillCoherence("heal", "magic", null)).toBe(
      "canonical_skill_magic_school_mismatch",
    );
  });

  it("refuse heal + physical", () => {
    expect(checkCanonicalSkillCoherence("heal", "physical", null)).toBe(
      "canonical_skill_attack_defense_kind_mismatch",
    );
  });

  it("n'impose rien à une clé non canonique (fireball libre en fire)", () => {
    expect(checkCanonicalSkillCoherence("fireball", "magic", "fire")).toBeNull();
    expect(checkCanonicalSkillCoherence("strike", "physical", null)).toBeNull();
  });

  it("ne verrouille pas les autres soins (clé water_heal)", () => {
    // Le verrou vise UNIQUEMENT la clé `heal`, pas tous les soins.
    expect(checkCanonicalSkillCoherence("water_heal", "magic", "water")).toBeNull();
  });
});

describe("Migration AddMagicSchoolToSkillDefinition — réversibilité", () => {
  const source = readFileSync(
    join(
      __dirname,
      "../migrations/1786068000000-AddMagicSchoolToSkillDefinition.ts",
    ),
    "utf8",
  );

  it("n'affecte aucune colonne damageType en SQL", () => {
    expect(source).not.toMatch(/"damageType"\s*=/);
  });

  it("n'affecte aucune colonne attackDefenseKind en SQL", () => {
    expect(source).not.toMatch(/"attackDefenseKind"\s*=/);
  });

  it("backfille magicSchool = 'sacred' pour heal", () => {
    expect(source).toMatch(
      /UPDATE "skill_definition" SET "magicSchool" = 'sacred' WHERE "key" = 'heal'/,
    );
  });
});

describe("resolveEffectiveCanCrit — critique réservé aux dégâts physiques", () => {
  it("physical + damage + canCrit true → true", () => {
    expect(resolveEffectiveCanCrit({ effectType: "damage", damageType: "physical", canCrit: true })).toBe(true);
  });
  it("physical + damage + canCrit false → false", () => {
    expect(resolveEffectiveCanCrit({ effectType: "damage", damageType: "physical", canCrit: false })).toBe(false);
  });
  it("magic → toujours false, même canCrit true", () => {
    expect(resolveEffectiveCanCrit({ effectType: "damage", damageType: "magic", canCrit: true })).toBe(false);
  });
  it("raw → toujours false, même canCrit true", () => {
    expect(resolveEffectiveCanCrit({ effectType: "damage", damageType: "raw", canCrit: true })).toBe(false);
  });
  it("heal (non damage) → toujours false", () => {
    expect(resolveEffectiveCanCrit({ effectType: "heal", damageType: "physical", canCrit: true })).toBe(false);
  });
  it("défauts (effectType/damageType absents) → damage + physical", () => {
    expect(resolveEffectiveCanCrit({ effectType: undefined, damageType: undefined, canCrit: true })).toBe(true);
    expect(resolveEffectiveCanCrit({ effectType: undefined, damageType: undefined, canCrit: false })).toBe(false);
  });
});

describe("normalizeSkillCombatFlags — invariants serveur-autoritaires", () => {
  const base = { attackDefenseKind: "physical" as const, canBeBlocked: true, canBeParried: false };

  it("physical + damage : canCrit conservé, défenses inchangées", () => {
    expect(normalizeSkillCombatFlags({ ...base, effectType: "damage", damageType: "physical", canCrit: true }))
      .toEqual({ canCrit: true, attackDefenseKind: "physical", canBeBlocked: true, canBeParried: false });
  });

  it("physical + damage + canCrit OMIS (undefined) → défaut true (nouveau skill physique)", () => {
    expect(normalizeSkillCombatFlags({ ...base, effectType: "damage", damageType: "physical", canCrit: undefined }).canCrit)
      .toBe(true);
  });

  it("physical + damage + canCrit false explicite → conservé false", () => {
    expect(normalizeSkillCombatFlags({ ...base, effectType: "damage", damageType: "physical", canCrit: false }).canCrit)
      .toBe(false);
  });

  it("magic + damage : canCrit false, attackDefenseKind magic, non blocable, non parable", () => {
    expect(normalizeSkillCombatFlags({
      effectType: "damage", damageType: "magic",
      attackDefenseKind: "physical", canCrit: true, canBeBlocked: true, canBeParried: true,
    })).toEqual({ canCrit: false, attackDefenseKind: "magic", canBeBlocked: false, canBeParried: false });
  });

  it("raw + damage : canCrit false, défenses conservées (pas de forçage magique)", () => {
    expect(normalizeSkillCombatFlags({
      effectType: "damage", damageType: "raw",
      attackDefenseKind: "physical", canCrit: true, canBeBlocked: true, canBeParried: true,
    })).toEqual({ canCrit: false, attackDefenseKind: "physical", canBeBlocked: true, canBeParried: true });
  });

  it("heal : canCrit toujours false", () => {
    expect(normalizeSkillCombatFlags({
      effectType: "heal", damageType: "physical",
      attackDefenseKind: "physical", canCrit: true, canBeBlocked: true, canBeParried: false,
    }).canCrit).toBe(false);
  });

  it("idempotent : re-normaliser un magic déjà cohérent ne change rien", () => {
    const once = normalizeSkillCombatFlags({
      effectType: "damage", damageType: "magic",
      attackDefenseKind: "magic", canCrit: false, canBeBlocked: false, canBeParried: false,
    });
    expect(normalizeSkillCombatFlags({ effectType: "damage", damageType: "magic", ...once })).toEqual(once);
  });
});
