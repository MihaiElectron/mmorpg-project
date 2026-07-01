import { calculateSkillXp } from './skill-xp-calculator';
import { SkillXpContext } from './skill-xp-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<SkillXpContext> = {}): SkillXpContext {
  return {
    skillDefinitionKey: "two_handed",
    domain: "combat",
    action: "attack_hit",
    success: true,
    difficulty: 10,
    quality: null,
    characterLevel: 1,
    skillLevel: 1,
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

describe("calculateSkillXp — contrat de base", () => {
  it("retourne skillDefinitionKey et xpAmount en cas de succes", () => {
    const result = calculateSkillXp(makeContext());
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("skillDefinitionKey", "two_handed");
    expect(result).toHaveProperty("xpAmount");
  });

  it("transmet exactement la skillDefinitionKey fournie par le domaine", () => {
    const result = calculateSkillXp(makeContext({ skillDefinitionKey: "mining" }));
    expect(result!.skillDefinitionKey).toBe("mining");
  });

  it("transmet la skillDefinitionKey pour n'importe quel domaine", () => {
    const result = calculateSkillXp(
      makeContext({ skillDefinitionKey: "diplomacy", domain: "diplomacy", action: "persuade" }),
    );
    expect(result!.skillDefinitionKey).toBe("diplomacy");
  });

  it("xpAmount est toujours un entier positif en cas de succes", () => {
    const result = calculateSkillXp(makeContext({ difficulty: 37, quality: 0.6 }));
    expect(Number.isInteger(result!.xpAmount)).toBe(true);
    expect(result!.xpAmount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Succes et echec
// ---------------------------------------------------------------------------

describe("calculateSkillXp — succes et echec", () => {
  it("accorde de l'XP en cas de succes", () => {
    const result = calculateSkillXp(makeContext({ success: true }));
    expect(result).not.toBeNull();
    expect(result!.xpAmount).toBeGreaterThan(0);
  });

  it("retourne null en cas d'echec (success: false)", () => {
    expect(calculateSkillXp(makeContext({ success: false }))).toBeNull();
  });

  it("retourne null si gathering echoue", () => {
    expect(
      calculateSkillXp(
        makeContext({ skillDefinitionKey: "mining", domain: "gathering", action: "gather", success: false }),
      ),
    ).toBeNull();
  });

  it("retourne null si craft echoue", () => {
    expect(
      calculateSkillXp(
        makeContext({ skillDefinitionKey: "smithing", domain: "crafting", action: "craft", success: false }),
      ),
    ).toBeNull();
  });

  it("retourne null si combat echoue", () => {
    expect(
      calculateSkillXp(makeContext({ skillDefinitionKey: "bow", domain: "combat", action: "attack_hit", success: false })),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Difficulte
// ---------------------------------------------------------------------------

describe("calculateSkillXp — difficulte", () => {
  it("difficulte elevee accorde plus d'XP que difficulte faible", () => {
    const easy = calculateSkillXp(makeContext({ difficulty: 10 }));
    const hard = calculateSkillXp(makeContext({ difficulty: 50 }));
    expect(hard!.xpAmount).toBeGreaterThan(easy!.xpAmount);
  });

  it("difficulty=0 produit quand meme au moins 1 XP", () => {
    const result = calculateSkillXp(makeContext({ difficulty: 0 }));
    expect(result!.xpAmount).toBeGreaterThanOrEqual(1);
  });

  it("difficulty=100 produit plus d'XP que difficulty=10", () => {
    const low = calculateSkillXp(makeContext({ difficulty: 10 }));
    const max = calculateSkillXp(makeContext({ difficulty: 100 }));
    expect(max!.xpAmount).toBeGreaterThan(low!.xpAmount);
  });

  it("XP augmente de maniere monotone avec la difficulte", () => {
    const d20 = calculateSkillXp(makeContext({ difficulty: 20 }))!.xpAmount;
    const d40 = calculateSkillXp(makeContext({ difficulty: 40 }))!.xpAmount;
    const d60 = calculateSkillXp(makeContext({ difficulty: 60 }))!.xpAmount;
    expect(d40).toBeGreaterThanOrEqual(d20);
    expect(d60).toBeGreaterThanOrEqual(d40);
  });
});

// ---------------------------------------------------------------------------
// Qualite
// ---------------------------------------------------------------------------

describe("calculateSkillXp — qualite", () => {
  it("quality=1.0 accorde plus d'XP que quality=0.0", () => {
    const base = calculateSkillXp(
      makeContext({ skillDefinitionKey: "smithing", domain: "crafting", action: "craft", quality: 0.0 }),
    );
    const masterwork = calculateSkillXp(
      makeContext({ skillDefinitionKey: "smithing", domain: "crafting", action: "craft", quality: 1.0 }),
    );
    expect(masterwork!.xpAmount).toBeGreaterThan(base!.xpAmount);
  });

  it("quality=null n'accorde pas de bonus et ne genere pas d'erreur", () => {
    const withNull = calculateSkillXp(makeContext({ quality: null }));
    const withZero = calculateSkillXp(makeContext({ quality: 0.0 }));
    expect(withNull!.xpAmount).toBe(withZero!.xpAmount);
  });

  it("quality=0.5 produit un bonus intermediaire entre 0.0 et 1.0", () => {
    const opts = { skillDefinitionKey: "smithing", domain: "crafting", action: "craft", difficulty: 20 } as const;
    const low = calculateSkillXp(makeContext({ ...opts, quality: 0.0 }))!.xpAmount;
    const mid = calculateSkillXp(makeContext({ ...opts, quality: 0.5 }))!.xpAmount;
    const high = calculateSkillXp(makeContext({ ...opts, quality: 1.0 }))!.xpAmount;
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("quality hors plage [0.0, 1.0] est borne sans erreur", () => {
    const clamped = calculateSkillXp(makeContext({ quality: 5.0 }));
    const max = calculateSkillXp(makeContext({ quality: 1.0 }));
    expect(clamped!.xpAmount).toBe(max!.xpAmount);
  });
});

// ---------------------------------------------------------------------------
// XP de base par domaine / action
// ---------------------------------------------------------------------------

describe("calculateSkillXp — XP de base par domaine", () => {
  it("gathering accorde plus d'XP de base que combat a difficulte egale", () => {
    const combat = calculateSkillXp(
      makeContext({ skillDefinitionKey: "bow", domain: "combat", action: "attack_hit", difficulty: 0, quality: null }),
    );
    const gather = calculateSkillXp(
      makeContext({ skillDefinitionKey: "mining", domain: "gathering", action: "gather", difficulty: 0, quality: null }),
    );
    expect(gather!.xpAmount).toBeGreaterThan(combat!.xpAmount);
  });

  it("crafting accorde plus d'XP de base que gathering a difficulte egale", () => {
    const gather = calculateSkillXp(
      makeContext({ skillDefinitionKey: "woodcutting", domain: "gathering", action: "gather", difficulty: 0, quality: null }),
    );
    const craft = calculateSkillXp(
      makeContext({ skillDefinitionKey: "smithing", domain: "crafting", action: "craft", difficulty: 0, quality: null }),
    );
    expect(craft!.xpAmount).toBeGreaterThan(gather!.xpAmount);
  });

  it("une action inconnue utilise l'XP par defaut sans erreur", () => {
    const result = calculateSkillXp(
      makeContext({ skillDefinitionKey: "leadership", domain: "leadership", action: "action_inconnue" }),
    );
    expect(result).not.toBeNull();
    expect(result!.xpAmount).toBeGreaterThanOrEqual(1);
  });
});
