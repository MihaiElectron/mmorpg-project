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
});
