import { describe, expect, it } from "vitest";
import {
  buildCreateMasteryDefinitionPayload,
  buildMasteryEffectsPayload,
  draftFromMasteryEffects,
  emptyCreateMasteryDefinitionDraft,
  hasActiveMasteryEffects,
  sortTargets,
  validateCreateMasteryDefinitionDraft,
  validateMasteryEffectsDraft,
  valueBoundsFor,
  type CreateMasteryDefinitionDraft,
  type MasteryEffectsDraft,
  type MasteryEffectTargetDto,
} from "./masteryEffects.types";

// Fixture miroir de GET /admin/mastery-effect-targets (source serveur).
function makeTarget(overrides: Partial<MasteryEffectTargetDto> = {}): MasteryEffectTargetDto {
  return {
    key: "maxHealth",
    label: "Vie max",
    category: "ressources",
    allowedModes: ["percentPerLevel", "flatPerLevel"],
    minValueByMode: { percentPerLevel: 0, flatPerLevel: 0 },
    maxValueByMode: { percentPerLevel: 5, flatPerLevel: 100 },
    runtimeStatus: "implemented",
    description: "test",
    ...overrides,
  };
}

const SERVER_TARGETS: MasteryEffectTargetDto[] = [
  makeTarget(),
  makeTarget({ key: "physicalAttack", label: "Attaque physique", category: "combat" }),
];
const CONTEXTUAL_STATS = ["physicalAttack"];

// ─── Effets (V2 — modifiers[]) ───────────────────────────────────────────────

describe("draftFromMasteryEffects", () => {
  it("retourne un draft vide pour {} / null / undefined", () => {
    const empty = { weaponType: "", modifiers: [] };
    expect(draftFromMasteryEffects({})).toEqual(empty);
    expect(draftFromMasteryEffects(null)).toEqual(empty);
    expect(draftFromMasteryEffects(undefined)).toEqual(empty);
  });

  it("reprend contexte + modifiers configurés", () => {
    expect(
      draftFromMasteryEffects({
        context: { weaponType: "two_handed_sword" },
        modifiers: [
          { stat: "physicalAttack", mode: "percentPerLevel", value: 5 },
          { stat: "maxHealth", mode: "flatPerLevel", value: 10 },
        ],
      }),
    ).toEqual({
      weaponType: "two_handed_sword",
      modifiers: [
        { stat: "physicalAttack", mode: "percentPerLevel", value: "5" },
        { stat: "maxHealth", mode: "flatPerLevel", value: "10" },
      ],
    });
  });

  it("affiche le legacy combat.damagePercentPerLevel comme ligne physicalAttack (effects purement V1)", () => {
    const draft = draftFromMasteryEffects({
      context: { weaponType: "bow" },
      combat: { damagePercentPerLevel: 2 },
    });
    expect(draft.modifiers).toEqual([
      { stat: "physicalAttack", mode: "percentPerLevel", value: "2" },
    ]);
  });

  it("préséance V2 : si modifiers[] existe, le legacy est ignoré (pas de double ligne)", () => {
    const draft = draftFromMasteryEffects({
      context: { weaponType: "bow" },
      modifiers: [{ stat: "physicalAttack", mode: "percentPerLevel", value: 2 }],
      combat: { damagePercentPerLevel: 5 },
    });
    expect(draft.modifiers).toEqual([
      { stat: "physicalAttack", mode: "percentPerLevel", value: "2" },
    ]);
  });

  it("conserve un weaponType inconnu du catalogue (jamais écrasé)", () => {
    const draft = draftFromMasteryEffects({
      context: { weaponType: "dagger" },
      modifiers: [{ stat: "physicalAttack", mode: "percentPerLevel", value: 0.5 }],
    });
    expect(draft.weaponType).toBe("dagger");
  });
});

describe("buildMasteryEffectsPayload", () => {
  it("aucune ligne valide → {} (désactivation)", () => {
    expect(buildMasteryEffectsPayload({ weaponType: "", modifiers: [] })).toEqual({});
    expect(
      buildMasteryEffectsPayload({
        weaponType: "two_handed_sword",
        modifiers: [{ stat: "", mode: "percentPerLevel", value: "5" }],
      }),
    ).toEqual({});
  });

  it("payload permanent (sans contexte) : modifiers[] seuls", () => {
    expect(
      buildMasteryEffectsPayload({
        weaponType: "",
        modifiers: [{ stat: "maxHealth", mode: "percentPerLevel", value: "1" }],
      }),
    ).toEqual({
      modifiers: [{ stat: "maxHealth", mode: "percentPerLevel", value: 1 }],
    });
  });

  it("payload contextuel arme : context + modifiers[]", () => {
    expect(
      buildMasteryEffectsPayload({
        weaponType: "two_handed_sword",
        modifiers: [{ stat: "physicalAttack", mode: "percentPerLevel", value: "5" }],
      }),
    ).toEqual({
      context: { weaponType: "two_handed_sword" },
      modifiers: [{ stat: "physicalAttack", mode: "percentPerLevel", value: 5 }],
    });
  });

  it("plusieurs modifiers, valeurs converties en number", () => {
    const payload = buildMasteryEffectsPayload({
      weaponType: "",
      modifiers: [
        { stat: "maxHealth", mode: "percentPerLevel", value: "1.5" },
        { stat: "healthRegen", mode: "flatPerLevel", value: "0.25" },
      ],
    });
    expect(payload.modifiers).toEqual([
      { stat: "maxHealth", mode: "percentPerLevel", value: 1.5 },
      { stat: "healthRegen", mode: "flatPerLevel", value: 0.25 },
    ]);
    expect(payload.modifiers?.every((m) => typeof m.value === "number")).toBe(true);
  });

  it("ne génère jamais la clé legacy combat ni de clé hors whitelist", () => {
    const payload = buildMasteryEffectsPayload({
      weaponType: "bow",
      modifiers: [{ stat: "physicalAttack", mode: "percentPerLevel", value: "5" }],
    });
    expect(Object.keys(payload).sort()).toEqual(["context", "modifiers"]);
    expect(payload).not.toHaveProperty("combat");
    for (const m of payload.modifiers ?? []) {
      expect(Object.keys(m).sort()).toEqual(["mode", "stat", "value"]);
    }
  });
});

describe("hasActiveMasteryEffects", () => {
  it("détecte {} / null / undefined comme inactif", () => {
    expect(hasActiveMasteryEffects({})).toBe(false);
    expect(hasActiveMasteryEffects(null)).toBe(false);
    expect(hasActiveMasteryEffects(undefined)).toBe(false);
  });

  it("détecte un effects configuré comme actif", () => {
    expect(
      hasActiveMasteryEffects({
        modifiers: [{ stat: "maxHealth", mode: "percentPerLevel", value: 1 }],
      }),
    ).toBe(true);
  });
});

describe("validateMasteryEffectsDraft (bornes et règles SERVEUR)", () => {
  const validate = (draft: MasteryEffectsDraft) =>
    validateMasteryEffectsDraft(draft, SERVER_TARGETS, CONTEXTUAL_STATS);
  const valid: MasteryEffectsDraft = {
    weaponType: "",
    modifiers: [{ stat: "maxHealth", mode: "percentPerLevel", value: "2" }],
  };

  it("accepte un draft vide (désactivation) et un draft complet", () => {
    expect(validate({ weaponType: "", modifiers: [] })).toBeNull();
    expect(validate(valid)).toBeNull();
  });

  it("exige une stat et un coefficient numérique par ligne", () => {
    expect(
      validate({
        weaponType: "",
        modifiers: [{ stat: "", mode: "percentPerLevel", value: "2" }],
      }),
    ).toMatch(/stat/i);
    expect(
      validate({
        weaponType: "",
        modifiers: [{ stat: "maxHealth", mode: "percentPerLevel", value: "abc" }],
      }),
    ).toMatch(/coefficient/i);
  });

  it("refuse une stat inconnue du catalogue serveur", () => {
    expect(
      validate({
        weaponType: "",
        modifiers: [{ stat: "criticalChance", mode: "percentPerLevel", value: "1" }],
      }),
    ).toMatch(/inconnue du serveur/);
  });

  it("borne selon min/max serveur du mode : percent 0–5, flat 0–100", () => {
    expect(
      validate({
        weaponType: "",
        modifiers: [{ stat: "maxHealth", mode: "percentPerLevel", value: "5.5" }],
      }),
    ).toMatch(/entre 0 et 5/);
    expect(
      validate({
        weaponType: "",
        modifiers: [{ stat: "maxHealth", mode: "flatPerLevel", value: "101" }],
      }),
    ).toMatch(/entre 0 et 100/);
    expect(
      validate({
        weaponType: "",
        modifiers: [{ stat: "maxHealth", mode: "flatPerLevel", value: "100" }],
      }),
    ).toBeNull();
  });

  it("accepte une stat CUSTOM venue du serveur (aucune liste locale figée)", () => {
    const customTargets = [
      ...SERVER_TARGETS,
      makeTarget({ key: "luck", label: "Chance", category: "social_threat" }),
    ];
    expect(
      validateMasteryEffectsDraft(
        {
          weaponType: "",
          modifiers: [{ stat: "luck", mode: "percentPerLevel", value: "2" }],
        },
        customTargets,
        CONTEXTUAL_STATS,
      ),
    ).toBeNull();
  });

  it("contexte weaponType : refuse une stat non contextuelle (règle serveur)", () => {
    expect(
      validate({
        weaponType: "two_handed_sword",
        modifiers: [{ stat: "maxHealth", mode: "percentPerLevel", value: "1" }],
      }),
    ).toMatch(/physicalAttack/);
    expect(
      validate({
        weaponType: "two_handed_sword",
        modifiers: [{ stat: "physicalAttack", mode: "percentPerLevel", value: "5" }],
      }),
    ).toBeNull();
  });
});

describe("helpers targets serveur", () => {
  it("valueBoundsFor dérive min/max/step du target et du mode", () => {
    const t = makeTarget();
    expect(valueBoundsFor(t, "percentPerLevel")).toEqual({ min: 0, max: 5, step: 0.25 });
    expect(valueBoundsFor(t, "flatPerLevel")).toEqual({ min: 0, max: 100, step: 1 });
    // Target absent (catalogue non chargé) : fallback sûr, la sauvegarde est
    // de toute façon bloquée par l'UI.
    expect(valueBoundsFor(undefined, "percentPerLevel").max).toBe(5);
  });

  it("sortTargets trie par catégorie puis label", () => {
    const sorted = sortTargets([
      makeTarget({ key: "b", label: "Zeta", category: "ressources" }),
      makeTarget({ key: "a", label: "Alpha", category: "combat" }),
    ]);
    expect(sorted.map((t) => t.key)).toEqual(["a", "b"]);
  });
});

// ─── Création (inchangée) ────────────────────────────────────────────────────

function validCreateDraft(
  overrides: Partial<CreateMasteryDefinitionDraft> = {},
): CreateMasteryDefinitionDraft {
  return {
    key: "dagger",
    name: "Dague",
    category: "combat",
    maxLevel: "100",
    baseXpPerLevel: "100",
    xpCurveExponent: "1.5",
    enabled: true,
    ...overrides,
  };
}

describe("buildCreateMasteryDefinitionPayload", () => {
  it("transforme les strings numériques en nombres et trim key/name/category", () => {
    const payload = buildCreateMasteryDefinitionPayload(
      validCreateDraft({
        key: " dagger ",
        name: " Dague ",
        category: " combat ",
        maxLevel: "50",
        baseXpPerLevel: "120",
        xpCurveExponent: "1.4",
      }),
    );
    expect(payload).toEqual({
      key: "dagger",
      name: "Dague",
      category: "combat",
      maxLevel: 50,
      baseXpPerLevel: 120,
      xpCurveExponent: 1.4,
      enabled: true,
      effects: {},
    });
  });

  it("envoie toujours effects: {} par défaut", () => {
    expect(buildCreateMasteryDefinitionPayload(validCreateDraft()).effects).toEqual({});
  });
});

describe("validateCreateMasteryDefinitionDraft", () => {
  it("accepte un brouillon valide et le brouillon initial complété", () => {
    expect(validateCreateMasteryDefinitionDraft(validCreateDraft())).toBeNull();
    const initial = emptyCreateMasteryDefinitionDraft();
    expect(
      validateCreateMasteryDefinitionDraft({ ...initial, key: "dagger", name: "Dague" }),
    ).toBeNull();
  });

  it("refuse une key vide ou hors format snake_case", () => {
    expect(validateCreateMasteryDefinitionDraft(validCreateDraft({ key: "" }))).toMatch(
      /key/i,
    );
    expect(
      validateCreateMasteryDefinitionDraft(validCreateDraft({ key: "Dagger!" })),
    ).toMatch(/invalide/i);
  });

  it("refuse name ou category vides", () => {
    expect(validateCreateMasteryDefinitionDraft(validCreateDraft({ name: " " }))).toMatch(
      /nom/i,
    );
    expect(
      validateCreateMasteryDefinitionDraft(validCreateDraft({ category: "" })),
    ).toMatch(/catégorie/i);
  });

  it("refuse maxLevel < 1 et baseXpPerLevel < 1", () => {
    expect(
      validateCreateMasteryDefinitionDraft(validCreateDraft({ maxLevel: "0" })),
    ).toMatch(/maxLevel/);
    expect(
      validateCreateMasteryDefinitionDraft(validCreateDraft({ baseXpPerLevel: "0" })),
    ).toMatch(/baseXpPerLevel/);
  });

  it("refuse xpCurveExponent <= 0 ou non numérique", () => {
    expect(
      validateCreateMasteryDefinitionDraft(validCreateDraft({ xpCurveExponent: "0" })),
    ).toMatch(/xpCurveExponent/);
    expect(
      validateCreateMasteryDefinitionDraft(validCreateDraft({ xpCurveExponent: "abc" })),
    ).toMatch(/xpCurveExponent/);
  });
});
