import { describe, expect, it } from "vitest";
import {
  formatCombatLogMessage,
  formatCreatureStateTransition,
  formatLootMessage,
} from "./combatLogMessage";

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

describe("formatCreatureStateTransition", () => {
  it("alive → fighting : engage le combat", () => {
    expect(formatCreatureStateTransition("alive", "fighting", "turkey")).toBe("turkey engage le combat");
  });
  it("fighting → escaping : s'enfuit", () => {
    expect(formatCreatureStateTransition("fighting", "escaping", "turkey")).toBe("turkey s'enfuit");
  });
  it("escaping → alive : abandonne et retourne à sa zone", () => {
    expect(formatCreatureStateTransition("escaping", "alive", "turkey")).toBe("turkey abandonne et retourne à sa zone");
  });
  it("fighting → alive : abandonne le combat", () => {
    expect(formatCreatureStateTransition("fighting", "alive", "turkey")).toBe("turkey abandonne le combat");
  });
  it("nom inconnu → libellé sobre", () => {
    expect(formatCreatureStateTransition("alive", "fighting", null)).toBe("la créature engage le combat");
  });
  it("transition vers dead → null (déjà couverte par combat:event death)", () => {
    expect(formatCreatureStateTransition("fighting", "dead", "turkey")).toBeNull();
  });
  it("pas de changement / valeurs manquantes → null", () => {
    expect(formatCreatureStateTransition("alive", "alive", "turkey")).toBeNull();
    expect(formatCreatureStateTransition(undefined, "fighting", "turkey")).toBeNull();
    expect(formatCreatureStateTransition("alive", undefined, "turkey")).toBeNull();
  });
  it("transition non prévue → fallback lisible", () => {
    expect(formatCreatureStateTransition("escaping", "fighting", "turkey")).toBe("turkey change d'état : escaping → fighting");
  });
});

describe("formatLootMessage", () => {
  it("nom fourni + quantité valide", () => {
    expect(formatLootMessage({ itemId: "feather", name: "plume", quantity: 3 })).toBe("Vous obtenez 3 × plume");
  });
  it("utilise lootItemId si name absent", () => {
    expect(formatLootMessage({ itemId: "x", lootItemId: "wooden_stick", quantity: 2 })).toBe("Vous obtenez 2 × wooden stick");
  });
  it("sans quantité valide + nom connu → pas de montant inventé", () => {
    expect(formatLootMessage({ itemId: "iron_ore" })).toBe("Vous obtenez iron ore");
    expect(formatLootMessage({ name: "plume", quantity: 0 })).toBe("Vous obtenez plume");
    expect(formatLootMessage({ name: "plume", quantity: -2 })).toBe("Vous obtenez plume");
  });
  it("sans quantité valide + nom inconnu → 'un objet'", () => {
    expect(formatLootMessage({})).toBe("Vous obtenez un objet");
    expect(formatLootMessage({ quantity: 0 })).toBe("Vous obtenez un objet");
  });
  it("quantité valide + nom inconnu → 'N × objet'", () => {
    expect(formatLootMessage({ quantity: 5 })).toBe("Vous obtenez 5 × objet");
  });
  it("payload invalide → null", () => {
    expect(formatLootMessage(null)).toBeNull();
    expect(formatLootMessage(undefined)).toBeNull();
  });
});
