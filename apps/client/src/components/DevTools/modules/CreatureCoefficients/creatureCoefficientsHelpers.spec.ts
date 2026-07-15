import { describe, expect, it } from "vitest";
import {
  buildPatch,
  invalidKeys,
  isDirty,
  isFieldInvalid,
  isFieldModified,
  toDraft,
} from "./creatureCoefficientsHelpers";
import { CreatureSecondaryCoefficients } from "./creatureCoefficients.types";

const CURRENT: CreatureSecondaryCoefficients = {
  attackPowerPerStrength: 2,
  defenseTotalPerEndurance: 1,
  accuracyPerDexterity: 0.5,
  dodgePerAgility: 0.3,
  blockPerEndurance: 0.2,
  blockPerStrength: 0.1,
  blockReductionPercent: 25,
  parryPerStrength: 0.15,
  parryPerDexterity: 0.15,
  counterPerDexterity: 0.4,
  counterPerAgility: 0.3,
  counterPerIntelligence: 0.2,
  maxHealthPerVitality: 10,
  secondaryChanceCap: 40,
};

describe("creatureCoefficientsHelpers", () => {
  it("toDraft convertit chaque coefficient en chaîne (14 clés)", () => {
    const draft = toDraft(CURRENT);
    expect(Object.keys(draft)).toHaveLength(14);
    expect(draft.attackPowerPerStrength).toBe("2");
    expect(draft.accuracyPerDexterity).toBe("0.5");
  });

  it("isFieldInvalid détecte vide, NaN et Infinity", () => {
    expect(isFieldInvalid("")).toBe(true);
    expect(isFieldInvalid("   ")).toBe(true);
    expect(isFieldInvalid("abc")).toBe(true);
    expect(isFieldInvalid("Infinity")).toBe(true);
    expect(isFieldInvalid("2")).toBe(false);
    expect(isFieldInvalid("0.5")).toBe(false);
    expect(isFieldInvalid("-1")).toBe(false); // borne finale = serveur
  });

  it("invalidKeys retourne les champs invalides du brouillon", () => {
    const draft = toDraft(CURRENT);
    draft.attackPowerPerStrength = "";
    draft.dodgePerAgility = "NaN";
    expect(invalidKeys(draft).sort()).toEqual(["attackPowerPerStrength", "dodgePerAgility"].sort());
  });

  it("isFieldModified vrai seulement si valide ET différent", () => {
    expect(isFieldModified("5", 2)).toBe(true);
    expect(isFieldModified("2", 2)).toBe(false);
    expect(isFieldModified("", 2)).toBe(false); // invalide → non modifié
  });

  it("isDirty vrai dès qu'un champ valide diffère", () => {
    const draft = toDraft(CURRENT);
    expect(isDirty(draft, CURRENT)).toBe(false);
    draft.attackPowerPerStrength = "7";
    expect(isDirty(draft, CURRENT)).toBe(true);
  });

  it("buildPatch n'inclut QUE les champs modifiés et valides", () => {
    const draft = toDraft(CURRENT);
    draft.attackPowerPerStrength = "5"; // modifié
    draft.secondaryChanceCap = "30"; // modifié
    draft.defenseTotalPerEndurance = ""; // invalide → omis
    draft.dodgePerAgility = "0.3"; // inchangé → omis
    const patch = buildPatch(draft, CURRENT);
    expect(patch).toEqual({ attackPowerPerStrength: 5, secondaryChanceCap: 30 });
  });

  it("buildPatch renvoie un objet vide si aucun changement valide", () => {
    const draft = toDraft(CURRENT);
    draft.attackPowerPerStrength = "NaN"; // invalide, ignoré
    expect(buildPatch(draft, CURRENT)).toEqual({});
  });
});
