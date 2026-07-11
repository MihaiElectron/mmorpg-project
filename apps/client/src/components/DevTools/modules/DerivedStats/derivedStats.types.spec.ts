import { describe, expect, it } from "vitest";
import {
  buildCreateDerivedStatPayload,
  buildDuplicateDerivedStatPayload,
  buildUpdateDerivedStatPayload,
  draftFromDerivedStat,
  emptyDerivedStatDraft,
  validateDerivedStatDraft,
  validateDerivedStatKey,
  type DerivedStatDraft,
  type DerivedStatFullDto,
} from "./derivedStats.types";

function makeDef(overrides: Partial<DerivedStatFullDto> = {}): DerivedStatFullDto {
  return {
    key: "luck",
    label: "Chance",
    category: "social_threat",
    baseValue: 1,
    rawStatSource: null,
    primaryCoefficients: { charisma: 0.5 },
    minValue: 0,
    maxValue: null,
    displayOrder: 0,
    enabled: true,
    masteryEligible: false,
    allowedModifierModes: [],
    runtimeStatus: "calculatedOnly",
    description: null,
    ...overrides,
  };
}

function validDraft(overrides: Partial<DerivedStatDraft> = {}): DerivedStatDraft {
  return {
    ...emptyDerivedStatDraft(),
    key: "luck",
    label: "Chance",
    category: "social_threat",
    baseValue: "1",
    minValue: "0",
    coefficients: { ...emptyDerivedStatDraft().coefficients, charisma: "0.5" },
    ...overrides,
  };
}

describe("draftFromDerivedStat", () => {
  it("reprend les valeurs serveur (coefficients en string, null → vide)", () => {
    const draft = draftFromDerivedStat(makeDef());
    expect(draft.key).toBe("luck");
    expect(draft.coefficients.charisma).toBe("0.5");
    expect(draft.coefficients.strength).toBe("");
    expect(draft.minValue).toBe("0");
    expect(draft.maxValue).toBe("");
    expect(draft.description).toBe("");
    expect(draft.runtimeStatus).toBe("calculatedOnly");
  });
});

describe("validateDerivedStatDraft", () => {
  it("accepte un brouillon valide (create et edit)", () => {
    expect(validateDerivedStatDraft(validDraft(), "create")).toBeNull();
    expect(validateDerivedStatDraft(validDraft(), "edit")).toBeNull();
  });

  it("create : exige une key camelCase ; edit : key ignorée", () => {
    expect(validateDerivedStatDraft(validDraft({ key: "" }), "create")).toMatch(/key/i);
    expect(validateDerivedStatDraft(validDraft({ key: "snake_case" }), "create")).toMatch(
      /camelCase/,
    );
    expect(validateDerivedStatDraft(validDraft({ key: "" }), "edit")).toBeNull();
  });

  it("exige label, refuse min > max et valeurs non finies", () => {
    expect(validateDerivedStatDraft(validDraft({ label: " " }), "edit")).toMatch(/label/i);
    expect(
      validateDerivedStatDraft(validDraft({ minValue: "10", maxValue: "5" }), "edit"),
    ).toMatch(/minValue/);
    expect(validateDerivedStatDraft(validDraft({ baseValue: "abc" }), "edit")).toMatch(
      /baseValue/,
    );
    expect(
      validateDerivedStatDraft(
        validDraft({ coefficients: { ...validDraft().coefficients, strength: "x" } }),
        "edit",
      ),
    ).toMatch(/strength/);
  });

  it("min/max vides = aucun clamp (null)", () => {
    expect(
      validateDerivedStatDraft(validDraft({ minValue: "", maxValue: "" }), "edit"),
    ).toBeNull();
  });
});

describe("buildCreateDerivedStatPayload", () => {
  it("convertit les strings en numbers et omet les coefficients vides/zéro", () => {
    const payload = buildCreateDerivedStatPayload(
      validDraft({
        key: " luck ",
        maxValue: "100",
        coefficients: { ...validDraft().coefficients, strength: "0", wisdom: "" },
      }),
    );
    expect(payload).toMatchObject({
      key: "luck",
      label: "Chance",
      baseValue: 1,
      minValue: 0,
      maxValue: 100,
      primaryCoefficients: { charisma: 0.5 },
      runtimeStatus: "calculatedOnly",
      masteryEligible: false,
      allowedModifierModes: [],
      description: null,
    });
    expect(payload.primaryCoefficients).not.toHaveProperty("strength");
    expect(payload.primaryCoefficients).not.toHaveProperty("wisdom");
  });

  it("min/max vides → null", () => {
    const payload = buildCreateDerivedStatPayload(validDraft({ minValue: "", maxValue: "" }));
    expect(payload.minValue).toBeNull();
    expect(payload.maxValue).toBeNull();
  });
});

describe("validateDerivedStatKey", () => {
  it("accepte une key camelCase, refuse vide et snake_case", () => {
    expect(validateDerivedStatKey("luckReworked")).toBeNull();
    expect(validateDerivedStatKey("")).toMatch(/key/i);
    expect(validateDerivedStatKey("snake_case")).toMatch(/camelCase/);
  });
});

describe("buildDuplicateDerivedStatPayload", () => {
  it("copie les champs de config et remplace uniquement la key", () => {
    const def = makeDef({
      key: "luck",
      label: "Chance",
      enabled: false,
      baseValue: 3,
      minValue: 0,
      maxValue: 100,
      primaryCoefficients: { charisma: 0.5 },
      masteryEligible: true,
      allowedModifierModes: ["percentPerLevel"],
      runtimeStatus: "notHooked",
      description: "desc",
    });
    const payload = buildDuplicateDerivedStatPayload(def, " luckReworked ");
    expect(payload).toEqual({
      key: "luckReworked",
      label: "Chance",
      category: def.category,
      enabled: false,
      baseValue: 3,
      minValue: 0,
      maxValue: 100,
      primaryCoefficients: { charisma: 0.5 },
      masteryEligible: true,
      allowedModifierModes: ["percentPerLevel"],
      runtimeStatus: "notHooked",
      description: "desc",
    });
  });

  it("clone les structures (pas de partage de référence)", () => {
    const def = makeDef({ primaryCoefficients: { charisma: 0.5 }, allowedModifierModes: [] });
    const payload = buildDuplicateDerivedStatPayload(def, "luckCopy");
    expect(payload.primaryCoefficients).not.toBe(def.primaryCoefficients);
    expect(payload.allowedModifierModes).not.toBe(def.allowedModifierModes);
  });
});

describe("buildUpdateDerivedStatPayload", () => {
  it("patch vide si rien n'a changé (jamais de key)", () => {
    const def = makeDef();
    const patch = buildUpdateDerivedStatPayload(def, draftFromDerivedStat(def));
    expect(patch).toEqual({});
  });

  it("ne contient que les champs modifiés, jamais la key", () => {
    const def = makeDef();
    const draft = draftFromDerivedStat(def);
    const patch = buildUpdateDerivedStatPayload(def, {
      ...draft,
      label: "Fortune",
      masteryEligible: true,
      allowedModifierModes: ["percentPerLevel"],
      runtimeStatus: "notHooked",
    });
    expect(patch).toEqual({
      label: "Fortune",
      masteryEligible: true,
      allowedModifierModes: ["percentPerLevel"],
      runtimeStatus: "notHooked",
    });
    expect(patch).not.toHaveProperty("key");
  });

  it("détecte un changement de coefficients", () => {
    const def = makeDef();
    const draft = draftFromDerivedStat(def);
    const patch = buildUpdateDerivedStatPayload(def, {
      ...draft,
      coefficients: { ...draft.coefficients, charisma: "1" },
    });
    expect(patch.primaryCoefficients).toEqual({ charisma: 1 });
  });
});
