import { describe, expect, it } from "vitest";
import { formatCombatLogMessage } from "./combatLogMessage";

const LOCAL = "char-local";
const resolveName = (actorType: string | undefined, id: string | undefined) => {
  if (actorType === "creature" && id === "creature-1") return "turkey";
  return null;
};
const opts = { localCharacterId: LOCAL, resolveName };

describe("formatCombatLogMessage", () => {
  it("joueur local inflige des dégâts à une créature nommée", () => {
    const msg = formatCombatLogMessage(
      { type: "damage", amount: 8, sourceType: "player", sourceId: LOCAL, targetType: "creature", targetId: "creature-1" },
      opts,
    );
    expect(msg).toBe("Vous infligez 8 dégâts à turkey");
  });

  it("créature nommée inflige des dégâts au joueur local", () => {
    const msg = formatCombatLogMessage(
      { type: "damage", amount: 3, sourceType: "creature", sourceId: "creature-1", targetType: "player", targetId: LOCAL },
      opts,
    );
    expect(msg).toBe("turkey vous inflige 3 dégâts");
  });

  it("mort d'une créature nommée", () => {
    const msg = formatCombatLogMessage(
      { type: "death", sourceType: "player", sourceId: LOCAL, targetType: "creature", targetId: "creature-1" },
      opts,
    );
    expect(msg).toBe("turkey est mort");
  });

  it("mort du joueur local", () => {
    const msg = formatCombatLogMessage(
      { type: "death", sourceType: "creature", sourceId: "creature-1", targetType: "player", targetId: LOCAL },
      opts,
    );
    expect(msg).toBe("Vous êtes mort");
  });

  it("identité inconnue → libellé sobre, sans inventer", () => {
    const msg = formatCombatLogMessage(
      { type: "damage", amount: 5, sourceType: "creature", sourceId: "unknown", targetType: "player", targetId: "other" },
      { localCharacterId: LOCAL, resolveName },
    );
    // ni source ni cible connues → "la créature" (source) et "un joueur" (cible)
    expect(msg).toBe("la créature inflige 5 dégâts à un joueur");
  });

  it("damage sans amount valide → null (pas de ligne)", () => {
    expect(formatCombatLogMessage({ type: "damage", amount: 0, sourceType: "player", sourceId: LOCAL, targetType: "creature", targetId: "creature-1" }, opts)).toBeNull();
    expect(formatCombatLogMessage({ type: "damage", sourceType: "player", targetType: "creature", targetId: "creature-1" }, opts)).toBeNull();
  });

  it("payload invalide / type inconnu → null", () => {
    expect(formatCombatLogMessage(null)).toBeNull();
    expect(formatCombatLogMessage(undefined)).toBeNull();
    expect(formatCombatLogMessage({} as never)).toBeNull();
    expect(formatCombatLogMessage({ type: "heal", amount: 5 } as never, opts)).toBeNull();
  });
});
