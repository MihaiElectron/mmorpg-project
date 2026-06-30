import { EntityManager } from 'typeorm';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { Item } from '../items/entities/item.entity';
import { recalculateEquipmentStats } from './equipment-stats.helper';

function makeItem(attack: number | null, defense: number | null): Item {
  return { id: "item-x", attack, defense } as Item;
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
