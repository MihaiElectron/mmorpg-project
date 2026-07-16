import { isAttackParryable } from "./combat-parryability.helper";

describe("isAttackParryable — parabilité par la nature défensive (contrat corrigé)", () => {
  it("physical + physical → parable", () => {
    expect(isAttackParryable({ attackDefenseKind: "physical", damageType: "physical" })).toBe(true);
  });

  it("physical + raw → PARABLE (raw n'est pas une nature défensive)", () => {
    expect(isAttackParryable({ attackDefenseKind: "physical", damageType: "raw" })).toBe(true);
  });

  it("magic + physical → non parable (sort pur)", () => {
    expect(isAttackParryable({ attackDefenseKind: "magic", damageType: "physical" })).toBe(false);
  });

  it("magic + raw → non parable", () => {
    expect(isAttackParryable({ attackDefenseKind: "magic", damageType: "raw" })).toBe(false);
  });

  it("attackDefenseKind absent + physical → parable (défaut physical)", () => {
    expect(isAttackParryable({ damageType: "physical" })).toBe(true);
  });

  it("attackDefenseKind absent + raw → PARABLE (défaut physical, raw ignoré ici)", () => {
    expect(isAttackParryable({ damageType: "raw" })).toBe(true);
  });

  it("attackDefenseKind null + raw → parable (null → défaut physical)", () => {
    expect(isAttackParryable({ attackDefenseKind: null, damageType: "raw" })).toBe(true);
  });

  it("attackDefenseKind null + damageType absent → parable (double défaut physical)", () => {
    expect(isAttackParryable({ attackDefenseKind: null, damageType: null })).toBe(true);
    expect(isAttackParryable({})).toBe(true);
  });

  it("la portée n'est PAS un paramètre du helper (ranged physique reste parable)", () => {
    // Le helper n'accepte que attackDefenseKind + damageType : aucune notion de
    // melee/ranged. Un projectile physique est donc parable comme la mêlée.
    const anyInput = { attackDefenseKind: "physical", damageType: "physical", attackRangeKind: "ranged" } as unknown as Parameters<typeof isAttackParryable>[0];
    expect(isAttackParryable(anyInput)).toBe(true);
  });
});
