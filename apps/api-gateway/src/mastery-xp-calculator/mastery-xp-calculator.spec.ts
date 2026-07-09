import { calculateMasteryXp } from './mastery-xp-calculator';
import { MasteryXpContext } from './mastery-xp-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<MasteryXpContext> = {}): MasteryXpContext {
  return {
    masteryDefinitionKey: "two_handed",
    domain: "combat",
    action: "attack_hit",
    success: true,
    difficulty: 10,
    quality: null,
    characterLevel: 1,
    masteryLevel: 1,
    duration: null,
    damage: null,
    blockedDamage: null,
    healedAmount: null,
    buffs: [],
    debuffs: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Contrat de base
// ---------------------------------------------------------------------------

describe("calculateMasteryXp — contrat de base", () => {
  it("retourne masteryDefinitionKey et xpAmount en cas de succes", () => {
    const result = calculateMasteryXp(makeContext());
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("masteryDefinitionKey", "two_handed");
    expect(result).toHaveProperty("xpAmount");
  });

  it("transmet exactement la masteryDefinitionKey fournie par le domaine", () => {
    const result = calculateMasteryXp(makeContext({ masteryDefinitionKey: "mining" }));
    expect(result!.masteryDefinitionKey).toBe("mining");
  });

  it("transmet la masteryDefinitionKey pour n'importe quel domaine", () => {
    const result = calculateMasteryXp(
      makeContext({ masteryDefinitionKey: "diplomacy", domain: "diplomacy", action: "persuade" }),
    );
    expect(result!.masteryDefinitionKey).toBe("diplomacy");
  });

  it("xpAmount est toujours un entier positif en cas de succes", () => {
    const result = calculateMasteryXp(makeContext({ difficulty: 37, quality: 0.6 }));
    expect(Number.isInteger(result!.xpAmount)).toBe(true);
    expect(result!.xpAmount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Succes et echec
// ---------------------------------------------------------------------------

describe("calculateMasteryXp — succes et echec", () => {
  it("accorde de l'XP en cas de succes", () => {
    const result = calculateMasteryXp(makeContext({ success: true }));
    expect(result).not.toBeNull();
    expect(result!.xpAmount).toBeGreaterThan(0);
  });

  it("retourne null en cas d'echec (success: false)", () => {
    expect(calculateMasteryXp(makeContext({ success: false }))).toBeNull();
  });

  it("retourne null si gathering echoue", () => {
    expect(
      calculateMasteryXp(
        makeContext({ masteryDefinitionKey: "mining", domain: "gathering", action: "gather", success: false }),
      ),
    ).toBeNull();
  });

  it("retourne null si craft echoue", () => {
    expect(
      calculateMasteryXp(
        makeContext({ masteryDefinitionKey: "smithing", domain: "crafting", action: "craft", success: false }),
      ),
    ).toBeNull();
  });

  it("retourne null si combat echoue", () => {
    expect(
      calculateMasteryXp(makeContext({ masteryDefinitionKey: "bow", domain: "combat", action: "attack_hit", success: false })),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Difficulte
// ---------------------------------------------------------------------------

describe("calculateMasteryXp — difficulte", () => {
  it("difficulte elevee accorde plus d'XP que difficulte faible", () => {
    const easy = calculateMasteryXp(makeContext({ difficulty: 10 }));
    const hard = calculateMasteryXp(makeContext({ difficulty: 50 }));
    expect(hard!.xpAmount).toBeGreaterThan(easy!.xpAmount);
  });

  it("difficulty=0 produit quand meme au moins 1 XP", () => {
    const result = calculateMasteryXp(makeContext({ difficulty: 0 }));
    expect(result!.xpAmount).toBeGreaterThanOrEqual(1);
  });

  it("difficulty=100 produit plus d'XP que difficulty=10", () => {
    const low = calculateMasteryXp(makeContext({ difficulty: 10 }));
    const max = calculateMasteryXp(makeContext({ difficulty: 100 }));
    expect(max!.xpAmount).toBeGreaterThan(low!.xpAmount);
  });

  it("XP augmente de maniere monotone avec la difficulte", () => {
    const d20 = calculateMasteryXp(makeContext({ difficulty: 20 }))!.xpAmount;
    const d40 = calculateMasteryXp(makeContext({ difficulty: 40 }))!.xpAmount;
    const d60 = calculateMasteryXp(makeContext({ difficulty: 60 }))!.xpAmount;
    expect(d40).toBeGreaterThanOrEqual(d20);
    expect(d60).toBeGreaterThanOrEqual(d40);
  });
});

// ---------------------------------------------------------------------------
// Qualite
// ---------------------------------------------------------------------------

describe("calculateMasteryXp — qualite", () => {
  it("quality=1.0 accorde plus d'XP que quality=0.0", () => {
    const base = calculateMasteryXp(
      makeContext({ masteryDefinitionKey: "smithing", domain: "crafting", action: "craft", quality: 0.0 }),
    );
    const masterwork = calculateMasteryXp(
      makeContext({ masteryDefinitionKey: "smithing", domain: "crafting", action: "craft", quality: 1.0 }),
    );
    expect(masterwork!.xpAmount).toBeGreaterThan(base!.xpAmount);
  });

  it("quality=null n'accorde pas de bonus et ne genere pas d'erreur", () => {
    const withNull = calculateMasteryXp(makeContext({ quality: null }));
    const withZero = calculateMasteryXp(makeContext({ quality: 0.0 }));
    expect(withNull!.xpAmount).toBe(withZero!.xpAmount);
  });

  it("quality=0.5 produit un bonus intermediaire entre 0.0 et 1.0", () => {
    const opts = { masteryDefinitionKey: "smithing", domain: "crafting", action: "craft", difficulty: 20 } as const;
    const low = calculateMasteryXp(makeContext({ ...opts, quality: 0.0 }))!.xpAmount;
    const mid = calculateMasteryXp(makeContext({ ...opts, quality: 0.5 }))!.xpAmount;
    const high = calculateMasteryXp(makeContext({ ...opts, quality: 1.0 }))!.xpAmount;
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("quality hors plage [0.0, 1.0] est borne sans erreur", () => {
    const clamped = calculateMasteryXp(makeContext({ quality: 5.0 }));
    const max = calculateMasteryXp(makeContext({ quality: 1.0 }));
    expect(clamped!.xpAmount).toBe(max!.xpAmount);
  });
});

// ---------------------------------------------------------------------------
// XP de base par domaine / action
// ---------------------------------------------------------------------------

describe("calculateMasteryXp — XP de base par domaine", () => {
  it("gathering accorde plus d'XP de base que combat a difficulte egale", () => {
    const combat = calculateMasteryXp(
      makeContext({ masteryDefinitionKey: "bow", domain: "combat", action: "attack_hit", difficulty: 0, quality: null }),
    );
    const gather = calculateMasteryXp(
      makeContext({ masteryDefinitionKey: "mining", domain: "gathering", action: "gather", difficulty: 0, quality: null }),
    );
    expect(gather!.xpAmount).toBeGreaterThan(combat!.xpAmount);
  });

  it("crafting accorde plus d'XP de base que gathering a difficulte egale", () => {
    const gather = calculateMasteryXp(
      makeContext({ masteryDefinitionKey: "woodcutting", domain: "gathering", action: "gather", difficulty: 0, quality: null }),
    );
    const craft = calculateMasteryXp(
      makeContext({ masteryDefinitionKey: "smithing", domain: "crafting", action: "craft", difficulty: 0, quality: null }),
    );
    expect(craft!.xpAmount).toBeGreaterThan(gather!.xpAmount);
  });

  it("une action inconnue utilise l'XP par defaut sans erreur", () => {
    const result = calculateMasteryXp(
      makeContext({ masteryDefinitionKey: "leadership", domain: "leadership", action: "action_inconnue" }),
    );
    expect(result).not.toBeNull();
    expect(result!.xpAmount).toBeGreaterThanOrEqual(1);
  });
});
