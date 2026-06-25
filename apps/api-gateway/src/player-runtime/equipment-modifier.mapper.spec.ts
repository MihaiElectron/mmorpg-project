// apps/api-gateway/src/player-runtime/equipment-modifier.mapper.spec.ts

import { equipmentToModifiers } from './equipment-modifier.mapper';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { Item } from '../items/entities/item.entity';

function makeItem(overrides: Partial<Item> = {}): Item {
  return Object.assign(new Item(), {
    id: 'item-1',
    name: 'Iron Sword',
    type: 'weapon',
    category: 'sword',
    attack: 5,
    defense: 0,
    range: null,
    slot: 'right-hand',
    ...overrides,
  } as Item);
}

function makeEquip(item: Item, overrides: Partial<CharacterEquipment> = {}): CharacterEquipment {
  return Object.assign(new CharacterEquipment(), {
    id: 'equip-1',
    characterId: 'char-1',
    itemId: item.id,
    item,
    slot: 'right-hand',
    ...overrides,
  } as CharacterEquipment);
}

describe('equipmentToModifiers', () => {
  it('retourne [] si aucun équipement', () => {
    expect(equipmentToModifiers([])).toEqual([]);
  });

  it('retourne [] si item absent sur la ligne (relation non chargée)', () => {
    const equip = makeEquip(makeItem());
    (equip as any).item = undefined;
    expect(equipmentToModifiers([equip])).toEqual([]);
  });

  it('produit un modifier attackPower pour item.attack > 0', () => {
    const item = makeItem({ attack: 8, defense: 0, range: null });
    const mods = equipmentToModifiers([makeEquip(item)]);

    expect(mods).toHaveLength(1);
    expect(mods[0].targetStat).toBe('attackPower');
    expect(mods[0].value).toBe(8);
    expect(mods[0].operation).toBe('flat');
    expect(mods[0].sourceType).toBe('equipment');
    expect(mods[0].sourceLabel).toBe('Iron Sword');
    expect(mods[0].enabled).toBe(true);
  });

  it('produit un modifier defenseTotal pour item.defense > 0', () => {
    const item = makeItem({ name: 'Iron Shield', attack: 0, defense: 12, range: null });
    const mods = equipmentToModifiers([makeEquip(item)]);

    expect(mods).toHaveLength(1);
    expect(mods[0].targetStat).toBe('defenseTotal');
    expect(mods[0].value).toBe(12);
    expect(mods[0].sourceLabel).toBe('Iron Shield');
  });

  it('produit un modifier attackRange pour item.range > 0', () => {
    const item = makeItem({ name: 'Shortbow', attack: 0, defense: 0, range: 200 });
    const mods = equipmentToModifiers([makeEquip(item)]);

    expect(mods).toHaveLength(1);
    expect(mods[0].targetStat).toBe('attackRange');
    expect(mods[0].value).toBe(200);
  });

  it('produit plusieurs modifiers pour un item avec attack et defense', () => {
    const item = makeItem({ name: 'Battle Axe', attack: 10, defense: 3, range: null });
    const mods = equipmentToModifiers([makeEquip(item)]);

    expect(mods).toHaveLength(2);
    const stats = mods.map((m) => m.targetStat);
    expect(stats).toContain('attackPower');
    expect(stats).toContain('defenseTotal');
  });

  it('produit trois modifiers pour un item avec attack, defense et range', () => {
    const item = makeItem({ attack: 5, defense: 2, range: 150 });
    const mods = equipmentToModifiers([makeEquip(item)]);

    expect(mods).toHaveLength(3);
  });

  it('ignore attack=0 — aucun modifier attackPower', () => {
    const item = makeItem({ attack: 0, defense: 5, range: null });
    const mods = equipmentToModifiers([makeEquip(item)]);

    expect(mods.some((m) => m.targetStat === 'attackPower')).toBe(false);
    expect(mods.some((m) => m.targetStat === 'defenseTotal')).toBe(true);
  });

  it('ignore attack=null — aucun modifier attackPower', () => {
    const item = makeItem({ attack: null as any, defense: 4, range: null });
    const mods = equipmentToModifiers([makeEquip(item)]);

    expect(mods.every((m) => m.targetStat !== 'attackPower')).toBe(true);
  });

  it('génère des ids uniques par ligne + stat', () => {
    const item = makeItem({ attack: 5, defense: 3, range: null });
    const mods = equipmentToModifiers([makeEquip(item, { id: 'equip-abc' })]);

    const ids = mods.map((m) => m.id);
    expect(ids).toContain('equip-abc:attackPower');
    expect(ids).toContain('equip-abc:defenseTotal');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('agrège les modifiers de plusieurs pièces d\'équipement', () => {
    const sword = makeItem({ id: 'item-1', name: 'Sword', attack: 5, defense: 0 });
    const shield = makeItem({ id: 'item-2', name: 'Shield', attack: 0, defense: 8 });
    const mods = equipmentToModifiers([
      makeEquip(sword, { id: 'equip-1', slot: 'right-hand', itemId: sword.id }),
      makeEquip(shield, { id: 'equip-2', slot: 'left-hand', itemId: shield.id }),
    ]);

    expect(mods).toHaveLength(2);
    const attackMod = mods.find((m) => m.targetStat === 'attackPower');
    const defenseMod = mods.find((m) => m.targetStat === 'defenseTotal');
    expect(attackMod?.value).toBe(5);
    expect(defenseMod?.value).toBe(8);
  });

  it('priority est 10 pour tout l\'équipement', () => {
    const item = makeItem({ attack: 5, defense: 3, range: null });
    const mods = equipmentToModifiers([makeEquip(item)]);

    expect(mods.every((m) => m.priority === 10)).toBe(true);
  });

  it('sourceId = itemId', () => {
    const item = makeItem({ id: 'specific-item-id', attack: 5 });
    const mods = equipmentToModifiers([makeEquip(item, { itemId: 'specific-item-id' })]);

    expect(mods[0].sourceId).toBe('specific-item-id');
  });
});
