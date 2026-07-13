import { EntityManager } from 'typeorm';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { Item } from '../items/entities/item.entity';
import {
  recalculateEquipmentStats,
  aggregateEquipmentBonuses,
  sanitizeStatBonuses,
  sanitizeItemStatBonuses,
  aggregateEquipmentDerivedModifiers,
  mergeDerivedStatModifiers,
  resolveAllowedSecondaryStatKeys,
  clampCharacterResourcesToDerivedMax,
} from './equipment-stats.helper';
import { DerivedStatDefinition } from '../derived-stats/entities/derived-stat-definition.entity';

/** Définition minimale pour piloter l'allowlist secondaire dans les tests. */
function makeDef(key: string, enabled: boolean, runtimeStatus: string): DerivedStatDefinition {
  return { key, enabled, runtimeStatus } as unknown as DerivedStatDefinition;
}

function makeItem(attack: number | null, defense: number | null): Item {
  return { id: "item-x", attack, defense } as Item;
}

function makeBonusEquip(statBonuses: Record<string, unknown>): CharacterEquipment {
  return { characterId: "char-1", slot: "s", item: { statBonuses } as unknown as Item } as CharacterEquipment;
}

function makeEquip(slot: string, item: Item): CharacterEquipment {
  return { characterId: "char-1", slot, item } as CharacterEquipment;
}

function makeCharacter(baseAttack = 0, baseDefense = 0): Character {
  return { id: "char-1", baseAttack, baseDefense, attack: 0, defense: 0 } as Character;
}

function makeManager(character: Character, rows: CharacterEquipment[]): jest.Mocked<EntityManager> {
  return {
    findOne: jest.fn().mockResolvedValue(character),
    find: jest.fn().mockResolvedValue(rows),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  } as unknown as jest.Mocked<EntityManager>;
}

describe("recalculateEquipmentStats", () => {
  const characterId = "char-1";

  it("base 0 sans equipement = attack 0, defense 0", async () => {
    const manager = makeManager(makeCharacter(0, 0), []);
    await recalculateEquipmentStats(manager, characterId);
    expect(manager.update).toHaveBeenCalledWith(
      Character, { id: characterId }, { attack: 0, defense: 0 },
    );
  });

  it("base 10 sans equipement = attack 10", async () => {
    const manager = makeManager(makeCharacter(10, 0), []);
    await recalculateEquipmentStats(manager, characterId);
    expect(manager.update).toHaveBeenCalledWith(
      Character, { id: characterId }, { attack: 10, defense: 0 },
    );
  });

  it("base 10 + arme +5 = attack 15", async () => {
    const manager = makeManager(
      makeCharacter(10, 0),
      [makeEquip("right-hand", makeItem(5, 0))],
    );
    await recalculateEquipmentStats(manager, characterId);
    expect(manager.update).toHaveBeenCalledWith(
      Character, { id: characterId }, { attack: 15, defense: 0 },
    );
  });

  it("desequiper revient a la base (aucun equipement = baseAttack)", async () => {
    const manager = makeManager(makeCharacter(10, 4), []);
    await recalculateEquipmentStats(manager, characterId);
    expect(manager.update).toHaveBeenCalledWith(
      Character, { id: characterId }, { attack: 10, defense: 4 },
    );
  });

  it("plusieurs items = base + somme de tous les bonus", async () => {
    const manager = makeManager(
      makeCharacter(10, 5),
      [
        makeEquip("right-hand", makeItem(5, 0)),
        makeEquip("chest-armor", makeItem(0, 8)),
        makeEquip("left-ring", makeItem(2, 3)),
      ],
    );
    await recalculateEquipmentStats(manager, characterId);
    expect(manager.update).toHaveBeenCalledWith(
      Character, { id: characterId }, { attack: 17, defense: 16 },
    );
  });

  it("traite item.attack null comme 0", async () => {
    const manager = makeManager(
      makeCharacter(3, 0),
      [makeEquip("necklace", makeItem(null, 5))],
    );
    await recalculateEquipmentStats(manager, characterId);
    expect(manager.update).toHaveBeenCalledWith(
      Character, { id: characterId }, { attack: 3, defense: 5 },
    );
  });

  it("traite item.defense null comme 0", async () => {
    const manager = makeManager(
      makeCharacter(0, 2),
      [makeEquip("right-hand", makeItem(7, null))],
    );
    await recalculateEquipmentStats(manager, characterId);
    expect(manager.update).toHaveBeenCalledWith(
      Character, { id: characterId }, { attack: 7, defense: 2 },
    );
  });

  it("traite un item sans stats (undefined) comme 0,0", async () => {
    const brokenEquip = { characterId, slot: "headgear" } as CharacterEquipment;
    const validEquip = makeEquip("right-hand", makeItem(5, 0));
    const manager = makeManager(makeCharacter(0, 0), [brokenEquip, validEquip]);
    await recalculateEquipmentStats(manager, characterId);
    expect(manager.update).toHaveBeenCalledWith(
      Character, { id: characterId }, { attack: 5, defense: 0 },
    );
  });

  it("ne fait rien si le personnage est introuvable", async () => {
    const manager = makeManager(null as any, []);
    manager.findOne.mockResolvedValue(null);
    await recalculateEquipmentStats(manager, characterId);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it("charge les CharacterEquipment avec la relation item", async () => {
    const manager = makeManager(makeCharacter(), []);
    await recalculateEquipmentStats(manager, characterId);
    expect(manager.find).toHaveBeenCalledWith(CharacterEquipment, {
      where: { characterId },
      relations: ["item"],
    });
  });
});

describe("sanitizeStatBonuses (Équipement V1-A)", () => {
  it("ne conserve que les clés primaires connues et valeurs finies", () => {
    const out = sanitizeStatBonuses({
      strength: 5,
      intelligence: 3,
      unknownKey: 9, // ignoré
      criticalChance: 2, // dérivée → ignorée en V1
      vitality: Number.NaN, // non finie → ignorée
      agility: "x", // non numérique → ignorée
    });
    expect(out).toEqual({ strength: 5, intelligence: 3 });
  });

  it("entrée non-objet → objet vide", () => {
    expect(sanitizeStatBonuses(null)).toEqual({});
    expect(sanitizeStatBonuses(42)).toEqual({});
  });
});

describe("aggregateEquipmentBonuses (Équipement V1-A)", () => {
  it("aucun équipement → PrimaryStats à zéro", () => {
    const total = aggregateEquipmentBonuses([]);
    expect(total.strength).toBe(0);
    expect(Object.values(total).every((v) => v === 0)).toBe(true);
  });

  it("somme les bonus de plusieurs items équipés", () => {
    const total = aggregateEquipmentBonuses([
      makeBonusEquip({ strength: 5, intelligence: 2 }),
      makeBonusEquip({ strength: 3, wisdom: 4 }),
    ]);
    expect(total.strength).toBe(8);
    expect(total.intelligence).toBe(2);
    expect(total.wisdom).toBe(4);
  });

  it("ignore les clés inconnues et valeurs non finies", () => {
    const total = aggregateEquipmentBonuses([
      makeBonusEquip({ strength: 5, foo: 100, vitality: Number.POSITIVE_INFINITY }),
    ]);
    expect(total.strength).toBe(5);
    expect(total.vitality).toBe(0);
  });

  it("un item sans statBonuses ne contribue pas", () => {
    const total = aggregateEquipmentBonuses([
      { characterId: "c", slot: "s", item: {} } as never,
    ]);
    expect(Object.values(total).every((v) => v === 0)).toBe(true);
  });
});

// ─── V5-F lot 1 : stats secondaires items ─────────────────────────────────────

describe("resolveAllowedSecondaryStatKeys (V5-F)", () => {
  it("définitions fournies : ne garde que enabled + runtimeStatus implemented", () => {
    const defs = [
      makeDef("parryChance", true, "implemented"),
      makeDef("dodgeChance", false, "implemented"), // désactivée → exclue
      makeDef("magicResist", true, "calculatedOnly"), // non branchée → exclue
    ];
    const allowed = resolveAllowedSecondaryStatKeys(defs);
    expect(allowed.has("parryChance")).toBe(true);
    expect(allowed.has("dodgeChance")).toBe(false);
    expect(allowed.has("magicResist")).toBe(false);
  });

  it("exclut toujours les clés primaires", () => {
    const allowed = resolveAllowedSecondaryStatKeys([
      makeDef("strength", true, "implemented"),
      makeDef("parryChance", true, "implemented"),
    ]);
    expect(allowed.has("strength")).toBe(false);
    expect(allowed.has("parryChance")).toBe(true);
  });

  it("sans définitions : fallback constante (contient les dérivées implemented)", () => {
    const allowed = resolveAllowedSecondaryStatKeys(undefined);
    expect(allowed.has("parryChance")).toBe(true);
    expect(allowed.has("counterAttackPower")).toBe(true);
    expect(allowed.has("strength")).toBe(false); // primaire jamais autorisée
  });
});

describe("sanitizeItemStatBonuses (V5-F)", () => {
  const defs = [makeDef("parryChance", true, "implemented"), makeDef("counterAttackPower", true, "implemented")];

  it("conserve primaires ET secondaires autorisées dans un seul bag", () => {
    const out = sanitizeItemStatBonuses({ strength: 5, parryChance: 15, counterAttackPower: 8 }, defs);
    expect(out).toEqual({ strength: 5, parryChance: 15, counterAttackPower: 8 });
  });

  it("rejette les clés inconnues et non finies", () => {
    const out = sanitizeItemStatBonuses(
      { strength: 5, foo: 9, parryChance: Number.NaN, dodgeChance: 3 } as Record<string, unknown>,
      defs, // dodgeChance non listée ici → rejetée
    );
    expect(out).toEqual({ strength: 5 });
  });

  it("autorise les malus (valeurs négatives)", () => {
    expect(sanitizeItemStatBonuses({ parryChance: -5 }, defs)).toEqual({ parryChance: -5 });
  });

  it("entrée non-objet → {}", () => {
    expect(sanitizeItemStatBonuses(null, defs)).toEqual({});
    expect(sanitizeItemStatBonuses(42, defs)).toEqual({});
  });
});

describe("aggregateEquipmentDerivedModifiers (V5-F)", () => {
  const defs = [makeDef("parryChance", true, "implemented"), makeDef("counterAttackPower", true, "implemented")];

  it("agrège en flat uniquement (percent vide), somme sur plusieurs items", () => {
    const mods = aggregateEquipmentDerivedModifiers(
      [makeBonusEquip({ parryChance: 15, strength: 5 }), makeBonusEquip({ parryChance: 10, counterAttackPower: 8 })],
      defs,
    );
    expect(mods.percent).toEqual({});
    expect(mods.flat).toEqual({ parryChance: 25, counterAttackPower: 8 });
  });

  it("ignore primaires, clés inconnues et non finies", () => {
    const mods = aggregateEquipmentDerivedModifiers(
      [makeBonusEquip({ strength: 5, foo: 100, parryChance: Number.POSITIVE_INFINITY, counterAttackPower: 4 })],
      defs,
    );
    expect(mods.flat).toEqual({ counterAttackPower: 4 });
  });

  it("équipement vide → modificateurs vides", () => {
    expect(aggregateEquipmentDerivedModifiers([], defs)).toEqual({ percent: {}, flat: {} });
    expect(aggregateEquipmentDerivedModifiers(null, defs)).toEqual({ percent: {}, flat: {} });
  });
});

describe("mergeDerivedStatModifiers (V5-F)", () => {
  it("somme flat ET percent par clé sur plusieurs sources", () => {
    const merged = mergeDerivedStatModifiers(
      { percent: { physicalAttack: 10 }, flat: { parryChance: 5 } },
      { percent: { physicalAttack: 5 }, flat: { parryChance: 15, counterAttackPower: 8 } },
    );
    expect(merged.percent).toEqual({ physicalAttack: 15 });
    expect(merged.flat).toEqual({ parryChance: 20, counterAttackPower: 8 });
  });

  it("ignore les entrées null/undefined et valeurs non finies", () => {
    const merged = mergeDerivedStatModifiers(
      null,
      undefined,
      { percent: {}, flat: { parryChance: Number.NaN, dodgeChance: 3 } },
    );
    expect(merged.flat).toEqual({ dodgeChance: 3 });
  });
});

describe("clampCharacterResourcesToDerivedMax — stats secondaires d'item (V5-F Tier 2)", () => {
  function makeClampManager(character: any, equipment: any[]): jest.Mocked<EntityManager> {
    return {
      findOne: jest.fn().mockResolvedValue(character),
      find: jest.fn().mockResolvedValue(equipment),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<EntityManager>;
  }

  it("un item maxHealth secondaire relève le max dérivé → la ressource n'est PAS rognée", async () => {
    const character = { id: "c1", maxHealth: 100, health: 130, mana: 0, energy: 0, attack: 0, defense: 0 };
    // defs [] → DEFAULT defs (maxHealth réel) + fallback allowlist (maxHealth autorisé).
    const manager = makeClampManager(character, [{ item: { statBonuses: { maxHealth: 50 } } }]);
    await clampCharacterResourcesToDerivedMax(manager, "c1", [], null);
    // maxHealth dérivé = 100 + 50 (item) = 150 ; health 130 ≤ 150 → aucun clamp.
    expect(manager.update).not.toHaveBeenCalled();
  });

  it("sans item secondaire : max reste 100 → health rognée à 100 (référence)", async () => {
    const character = { id: "c1", maxHealth: 100, health: 130, mana: 0, energy: 0, attack: 0, defense: 0 };
    const manager = makeClampManager(character, []);
    await clampCharacterResourcesToDerivedMax(manager, "c1", [], null);
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: "c1" },
      expect.objectContaining({ health: 100 }),
    );
  });

  it("non-régression : une clé inconnue n'élève pas le max (health rognée comme sans item)", async () => {
    const character = { id: "c1", maxHealth: 100, health: 130, mana: 0, energy: 0, attack: 0, defense: 0 };
    const manager = makeClampManager(character, [{ item: { statBonuses: { foo: 999 } } }]);
    await clampCharacterResourcesToDerivedMax(manager, "c1", [], null);
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: "c1" },
      expect.objectContaining({ health: 100 }),
    );
  });
});
