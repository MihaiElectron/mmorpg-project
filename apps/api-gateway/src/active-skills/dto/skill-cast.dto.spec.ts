import { parseSkillCastPayload } from "./skill-cast.dto";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("parseSkillCastPayload", () => {
  it("accepte un payload valide", () => {
    expect(
      parseSkillCastPayload({ skillKey: "power_strike", targetType: "creature", targetId: UUID }),
    ).toEqual({ skillKey: "power_strike", targetType: "creature", targetId: UUID });
  });

  it("rejette un payload non-objet", () => {
    expect(parseSkillCastPayload(null)).toBeNull();
    expect(parseSkillCastPayload("x")).toBeNull();
  });

  it("rejette un champ inconnu", () => {
    expect(
      parseSkillCastPayload({
        skillKey: "k",
        targetType: "creature",
        targetId: UUID,
        damage: 999,
      }),
    ).toBeNull();
  });

  it("rejette targetType != creature", () => {
    expect(
      parseSkillCastPayload({ skillKey: "k", targetType: "player", targetId: UUID }),
    ).toBeNull();
  });

  it("rejette un skillKey vide", () => {
    expect(
      parseSkillCastPayload({ skillKey: "  ", targetType: "creature", targetId: UUID }),
    ).toBeNull();
  });

  it("rejette un targetId non-UUID", () => {
    expect(
      parseSkillCastPayload({ skillKey: "k", targetType: "creature", targetId: "not-a-uuid" }),
    ).toBeNull();
  });

  // ── Self (V1-G) ────────────────────────────────────────────────────────────

  it("accepte un payload self sans targetId", () => {
    expect(parseSkillCastPayload({ skillKey: "heal", targetType: "self" })).toEqual({
      skillKey: "heal",
      targetType: "self",
    });
  });

  it("rejette un self avec targetId présent", () => {
    expect(
      parseSkillCastPayload({ skillKey: "heal", targetType: "self", targetId: UUID }),
    ).toBeNull();
  });

  it("rejette un self avec un champ inconnu", () => {
    expect(
      parseSkillCastPayload({ skillKey: "heal", targetType: "self", foo: 1 }),
    ).toBeNull();
  });

  it("rejette un creature sans targetId", () => {
    expect(parseSkillCastPayload({ skillKey: "k", targetType: "creature" })).toBeNull();
  });
});
