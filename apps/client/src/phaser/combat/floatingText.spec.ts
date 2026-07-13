import { describe, expect, it } from "vitest";
import {
  formatFloatingCombatText,
  resolveFloatingColor,
  resolveFloatingFontStyle,
  resolveAnchorPosition,
  FLOATING_COLORS,
  FLOATING_TEXT_DURATION_MS,
} from "./floatingText";

describe("FLOATING_TEXT_DURATION_MS", () => {
  it("durée d'affichage portée à 1125 ms (×1.5)", () => {
    expect(FLOATING_TEXT_DURATION_MS).toBe(1125);
  });
});

describe("resolveAnchorPosition", () => {
  const fallback = { x: 500, y: 600 };

  it("ancre active avec coordonnées → utilise la position de l'ancre", () => {
    expect(resolveAnchorPosition({ x: 100, y: 200, active: true }, fallback)).toEqual({ x: 100, y: 200 });
  });

  it("ancre sans champ active (sprite Phaser vivant) → utilise l'ancre", () => {
    expect(resolveAnchorPosition({ x: 10, y: 20 }, fallback)).toEqual({ x: 10, y: 20 });
  });

  it("ancre inactive (détruite) → fallback", () => {
    expect(resolveAnchorPosition({ x: 100, y: 200, active: false }, fallback)).toEqual(fallback);
  });

  it("ancre null/undefined → fallback", () => {
    expect(resolveAnchorPosition(null, fallback)).toEqual(fallback);
    expect(resolveAnchorPosition(undefined, fallback)).toEqual(fallback);
  });

  it("ancre sans coordonnées numériques → fallback", () => {
    expect(resolveAnchorPosition({ active: true }, fallback)).toEqual(fallback);
    expect(resolveAnchorPosition({ x: undefined, y: 5, active: true }, fallback)).toEqual(fallback);
  });
});

describe("formatFloatingCombatText", () => {
  it("damage avec amount 8 → '-8'", () => {
    expect(formatFloatingCombatText({ type: "damage", amount: 8 })).toBe("-8");
  });

  it("damage avec text fourni → text fourni (prioritaire)", () => {
    expect(formatFloatingCombatText({ type: "damage", amount: 8, text: "-8 crit" })).toBe("-8 crit");
  });

  it("damage avec amount <= 0 → null (anti-spam)", () => {
    expect(formatFloatingCombatText({ type: "damage", amount: 0 })).toBeNull();
    expect(formatFloatingCombatText({ type: "damage", amount: -5 })).toBeNull();
  });

  it("damage sans amount ni text → null", () => {
    expect(formatFloatingCombatText({ type: "damage" })).toBeNull();
  });

  it("death → 'Mort' par défaut", () => {
    expect(formatFloatingCombatText({ type: "death" })).toBe("Mort");
  });

  it("death avec text fourni → text fourni", () => {
    expect(formatFloatingCombatText({ type: "death", text: "K.O." })).toBe("K.O.");
  });

  it("payload invalide → null", () => {
    expect(formatFloatingCombatText(null)).toBeNull();
    expect(formatFloatingCombatText(undefined)).toBeNull();
    expect(formatFloatingCombatText({})).toBeNull();
    expect(formatFloatingCombatText({ type: "buff", amount: 5 })).toBeNull();
  });

  it("V5-D1-B : soin → « +N » (jamais « +0 »)", () => {
    expect(formatFloatingCombatText({ type: "heal", amount: 15 })).toBe("+15");
    expect(formatFloatingCombatText({ type: "heal", amount: 0 })).toBeNull();
  });

  it("V4-F : esquive → 'Esquive' (jamais '-0'), même avec amount 0", () => {
    expect(formatFloatingCombatText({ type: "damage", isDodged: true, amount: 0 })).toBe("Esquive");
    expect(formatFloatingCombatText({ type: "damage", isDodged: true })).toBe("Esquive");
  });

  it("V4-H : hit bloqué → '-amount (bloqué)' (les dégâts finaux restent affichés)", () => {
    expect(
      formatFloatingCombatText({ type: "damage", amount: 30, isBlocked: true, blockedDamage: 30 }),
    ).toBe("-30 (bloqué)");
    // Avec text serveur prioritaire, l'annotation de blocage est ajoutée.
    expect(
      formatFloatingCombatText({ type: "damage", amount: 30, text: "-30", isBlocked: true }),
    ).toBe("-30 (bloqué)");
  });

  it("V4-H : esquive prime sur blocage (mutuellement exclusifs serveur) → 'Esquive'", () => {
    expect(
      formatFloatingCombatText({ type: "damage", isDodged: true, isBlocked: true, amount: 0 }),
    ).toBe("Esquive");
  });

  it("V4-H : hit non bloqué → pas d'annotation", () => {
    expect(formatFloatingCombatText({ type: "damage", amount: 8, isBlocked: false })).toBe("-8");
  });

  it("V4-I : hit paré → 'Parade' (jamais '0'), même avec amount 0", () => {
    expect(formatFloatingCombatText({ type: "damage", isParried: true, amount: 0 })).toBe("Parade");
    expect(formatFloatingCombatText({ type: "damage", isParried: true })).toBe("Parade");
  });

  it("V4-I : parade prioritaire sur esquive / blocage / critique", () => {
    expect(
      formatFloatingCombatText({
        type: "damage",
        isParried: true,
        isDodged: true,
        isBlocked: true,
        isCritical: true,
        amount: 0,
      }),
    ).toBe("Parade");
  });

  it("V4-I : contre-attaque → montant final (nombre seul, comme un dégât normal)", () => {
    expect(
      formatFloatingCombatText({ type: "damage", isCounterAttack: true, amount: 32 }),
    ).toBe("-32");
  });
});

describe("resolveFloatingColor", () => {
  it("damage sur joueur → rouge", () => {
    expect(resolveFloatingColor({ type: "damage", targetType: "player" })).toBe(
      FLOATING_COLORS.damageToPlayer,
    );
  });

  it("damage sur créature → jaune", () => {
    expect(resolveFloatingColor({ type: "damage", targetType: "creature" })).toBe(
      FLOATING_COLORS.damageToCreature,
    );
  });

  it("death → gris quelle que soit la cible", () => {
    expect(resolveFloatingColor({ type: "death", targetType: "creature" })).toBe(
      FLOATING_COLORS.death,
    );
  });

  it("V4-E : coup critique sur créature → rouge (distinct du jaune normal)", () => {
    expect(
      resolveFloatingColor({ type: "damage", targetType: "creature", isCritical: true }),
    ).toBe(FLOATING_COLORS.critical);
  });

  it("V4-F : esquive → bleu clair, jamais la couleur crit/joueur", () => {
    expect(
      resolveFloatingColor({ type: "damage", targetType: "player", isDodged: true }),
    ).toBe(FLOATING_COLORS.dodge);
    expect(
      resolveFloatingColor({ type: "damage", targetType: "creature", isDodged: true, isCritical: false }),
    ).toBe(FLOATING_COLORS.dodge);
  });

  it("V4-H : hit bloqué → gris acier, prime sur crit et sur la cible", () => {
    expect(
      resolveFloatingColor({ type: "damage", targetType: "creature", isBlocked: true }),
    ).toBe(FLOATING_COLORS.blocked);
    expect(
      resolveFloatingColor({ type: "damage", targetType: "player", isBlocked: true, isCritical: true }),
    ).toBe(FLOATING_COLORS.blocked);
  });

  it("V4-H : esquive prime sur blocage (couleur esquive)", () => {
    expect(
      resolveFloatingColor({ type: "damage", isDodged: true, isBlocked: true }),
    ).toBe(FLOATING_COLORS.dodge);
  });

  it("V4-I : parade → vert martial, prioritaire sur esquive/blocage/critique/cible", () => {
    expect(
      resolveFloatingColor({ type: "damage", targetType: "player", isParried: true }),
    ).toBe(FLOATING_COLORS.parried);
    expect(
      resolveFloatingColor({
        type: "damage",
        targetType: "player",
        isParried: true,
        isDodged: true,
        isBlocked: true,
        isCritical: true,
      }),
    ).toBe(FLOATING_COLORS.parried);
  });

  it("V4-I : contre-attaque critique → couleur critique (pas de couleur dédiée)", () => {
    expect(
      resolveFloatingColor({ type: "damage", targetType: "creature", isCounterAttack: true, isCritical: true }),
    ).toBe(FLOATING_COLORS.critical);
  });
});

describe("resolveFloatingFontStyle (V4-E)", () => {
  it("coup critique (damage) → bold italic", () => {
    expect(resolveFloatingFontStyle({ type: "damage", isCritical: true })).toBe("bold italic");
  });

  it("hit normal → bold", () => {
    expect(resolveFloatingFontStyle({ type: "damage", isCritical: false })).toBe("bold");
    expect(resolveFloatingFontStyle({ type: "damage" })).toBe("bold");
  });

  it("death (même critique) → bold (pas d'italique)", () => {
    expect(resolveFloatingFontStyle({ type: "death", isCritical: true })).toBe("bold");
  });

  it("V4-I : contre-attaque critique → conserve le style critique (bold italic)", () => {
    expect(
      resolveFloatingFontStyle({ type: "damage", isCounterAttack: true, isCritical: true }),
    ).toBe("bold italic");
  });
});
