// apps/api-gateway/src/player-runtime/runtime-source.spec.ts

import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { Item } from '../items/entities/item.entity';
import { EquipmentSource, EffectSource, DebugRuntimeSource, RuntimeSource } from './runtime-source';
import { PlayerRuntimeEffect, RuntimeModifier } from './player-runtime.types';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<Item> = {}): Item {
  return Object.assign(new Item(), {
    id: 'item-1',
    name: 'Iron Sword',
    type: 'weapon',
    category: 'sword',
    attack: 8,
    defense: 0,
    range: null,
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

function makeEffect(overrides: Partial<PlayerRuntimeEffect> = {}): PlayerRuntimeEffect {
  return {
    id: 'eff-1',
    sourceType: 'buff',
    sourceId: 'rage',
    sourceLabel: 'Rage',
    modifiers: [{ targetStat: 'attackPower', operation: 'flat', value: 10 }],
    enabled: true,
    ...overrides,
  };
}

// ─── EquipmentSource ─────────────────────────────────────────────────────────

describe('EquipmentSource', () => {
  it('kind === "equipment"', () => {
    expect(new EquipmentSource([]).kind).toBe('equipment');
  });

  it('implémente RuntimeSource', () => {
    const src: RuntimeSource = new EquipmentSource([]);
    expect(typeof src.getModifiers).toBe('function');
    expect(src.kind).toBe('equipment');
  });

  it('retourne [] si aucun équipement', () => {
    expect(new EquipmentSource([]).getModifiers()).toEqual([]);
  });

  it('produit un modifier pour un item avec attack > 0', () => {
    const item = makeItem({ attack: 8, defense: 0 });
    const mods = new EquipmentSource([makeEquip(item)]).getModifiers();

    expect(mods).toHaveLength(1);
    expect(mods[0].targetStat).toBe('attackPower');
    expect(mods[0].value).toBe(8);
    expect(mods[0].sourceType).toBe('equipment');
  });

  it('produit plusieurs modifiers pour un item avec attack et defense', () => {
    const item = makeItem({ attack: 5, defense: 3 });
    const mods = new EquipmentSource([makeEquip(item)]).getModifiers();

    expect(mods).toHaveLength(2);
    const stats = mods.map((m) => m.targetStat);
    expect(stats).toContain('attackPower');
    expect(stats).toContain('defenseTotal');
  });

  it('délègue à equipmentToModifiers — résultat identique', () => {
    const item = makeItem({ attack: 12, defense: 4 });
    const equip = makeEquip(item);
    const src = new EquipmentSource([equip]);
    const mods = src.getModifiers();

    expect(mods.every((m) => m.sourceType === 'equipment')).toBe(true);
    expect(mods.find((m) => m.targetStat === 'attackPower')?.value).toBe(12);
    expect(mods.find((m) => m.targetStat === 'defenseTotal')?.value).toBe(4);
  });

  it('agrège plusieurs pièces d\'équipement', () => {
    const sword  = makeItem({ id: 'i1', attack: 5, defense: 0 });
    const shield = makeItem({ id: 'i2', name: 'Shield', attack: 0, defense: 6 });
    const mods = new EquipmentSource([
      makeEquip(sword,  { id: 'e1', itemId: 'i1', slot: 'right-hand' }),
      makeEquip(shield, { id: 'e2', itemId: 'i2', slot: 'left-hand' }),
    ]).getModifiers();

    expect(mods).toHaveLength(2);
  });
});

// ─── EffectSource ─────────────────────────────────────────────────────────────

describe('EffectSource', () => {
  it('kind === "effect"', () => {
    expect(new EffectSource([]).kind).toBe('effect');
  });

  it('implémente RuntimeSource', () => {
    const src: RuntimeSource = new EffectSource([]);
    expect(typeof src.getModifiers).toBe('function');
    expect(src.kind).toBe('effect');
  });

  it('retourne [] si aucun effet', () => {
    expect(new EffectSource([]).getModifiers()).toEqual([]);
  });

  it('produit un modifier pour un effet actif', () => {
    const mods = new EffectSource([makeEffect()]).getModifiers();

    expect(mods).toHaveLength(1);
    expect(mods[0].targetStat).toBe('attackPower');
    expect(mods[0].value).toBe(10);
    expect(mods[0].sourceType).toBe('buff');
    expect(mods[0].sourceLabel).toBe('Rage');
  });

  it('ignore un effet disabled', () => {
    const mods = new EffectSource([makeEffect({ enabled: false })]).getModifiers();
    expect(mods).toEqual([]);
  });

  it('ignore un effet expiré', () => {
    const past = new Date(Date.now() - 10_000);
    const mods = new EffectSource([makeEffect({ expiresAt: past })]).getModifiers();
    expect(mods).toEqual([]);
  });

  it('inclut un effet avec expiresAt dans le futur', () => {
    const future = new Date(Date.now() + 60_000);
    const mods = new EffectSource([makeEffect({ expiresAt: future })]).getModifiers();
    expect(mods).toHaveLength(1);
  });

  it('agrège les modifiers de plusieurs effets actifs', () => {
    const rage  = makeEffect({ id: 'e1', modifiers: [{ targetStat: 'attackPower', operation: 'flat', value: 10 }] });
    const armor = makeEffect({ id: 'e2', sourceLabel: 'Shield Aura', modifiers: [{ targetStat: 'defenseTotal', operation: 'flat', value: 5 }] });
    const mods  = new EffectSource([rage, armor]).getModifiers();

    expect(mods).toHaveLength(2);
  });

  it('sourceType consumable supporté', () => {
    const eff = makeEffect({ sourceType: 'consumable', sourceLabel: 'Potion de force' });
    const mods = new EffectSource([eff]).getModifiers();
    expect(mods[0].sourceType).toBe('consumable');
  });
});

// ─── DebugRuntimeSource ───────────────────────────────────────────────────────

function makeDebugModifier(overrides: Partial<RuntimeModifier> = {}): RuntimeModifier {
  return {
    id: 'debug:char-1:1',
    sourceType: 'debug',
    sourceId: 'debug-registry',
    sourceLabel: 'Debug',
    targetStat: 'attackPower',
    operation: 'flat',
    value: 10,
    priority: 99,
    enabled: true,
    ...overrides,
  };
}

describe('DebugRuntimeSource', () => {
  it('kind === "debug"', () => {
    expect(new DebugRuntimeSource([]).kind).toBe('debug');
  });

  it('implémente RuntimeSource', () => {
    const src: RuntimeSource = new DebugRuntimeSource([]);
    expect(typeof src.getModifiers).toBe('function');
    expect(src.kind).toBe('debug');
  });

  it('retourne [] si aucun modifier', () => {
    expect(new DebugRuntimeSource([]).getModifiers()).toEqual([]);
  });

  it('retourne les modifiers passés en construction', () => {
    const mod = makeDebugModifier({ value: 25 });
    const mods = new DebugRuntimeSource([mod]).getModifiers();
    expect(mods).toHaveLength(1);
    expect(mods[0]).toBe(mod);
  });

  it('retourne plusieurs modifiers', () => {
    const mods = [makeDebugModifier({ id: 'd1' }), makeDebugModifier({ id: 'd2', targetStat: 'maxHp' })];
    expect(new DebugRuntimeSource(mods).getModifiers()).toHaveLength(2);
  });

  it('sourceType = "debug" sur les modifiers passés', () => {
    const mod = makeDebugModifier();
    expect(new DebugRuntimeSource([mod]).getModifiers()[0].sourceType).toBe('debug');
  });

  it('priority = 99 sur les modifiers debug', () => {
    const mod = makeDebugModifier();
    expect(new DebugRuntimeSource([mod]).getModifiers()[0].priority).toBe(99);
  });
});

// ─── Agrégation multi-sources ─────────────────────────────────────────────────

describe('RuntimeSource — agrégation', () => {
  it('flatMap de deux sources — les modifiers s\'accumulent', () => {
    const item   = makeItem({ attack: 5, defense: 0 });
    const eqSrc  = new EquipmentSource([makeEquip(item)]);
    const effSrc = new EffectSource([makeEffect()]);

    const sources: RuntimeSource[] = [eqSrc, effSrc];
    const all: RuntimeModifier[] = sources.flatMap((s) => s.getModifiers());

    expect(all).toHaveLength(2);
    const types = all.map((m) => m.sourceType);
    expect(types).toContain('equipment');
    expect(types).toContain('buff');
  });

  it('flatMap sur sources vides → []', () => {
    const sources: RuntimeSource[] = [new EquipmentSource([]), new EffectSource([])];
    expect(sources.flatMap((s) => s.getModifiers())).toEqual([]);
  });

  it('les priorités restent distinctes — equipment (10) < effect (20)', () => {
    const item = makeItem({ attack: 5, defense: 0 });
    const sources: RuntimeSource[] = [
      new EquipmentSource([makeEquip(item)]),
      new EffectSource([makeEffect()]),
    ];
    const mods = sources.flatMap((s) => s.getModifiers());
    const eqMod  = mods.find((m) => m.sourceType === 'equipment');
    const effMod = mods.find((m) => m.sourceType === 'buff');

    expect(eqMod?.priority).toBe(10);
    expect(effMod?.priority).toBe(20);
  });

  it('trois sources : equipment + effect + debug — tous les modifiers agrégés', () => {
    const item     = makeItem({ attack: 5, defense: 0 });
    const effect   = makeEffect();
    const debugMod = makeDebugModifier();
    const sources: RuntimeSource[] = [
      new EquipmentSource([makeEquip(item)]),
      new EffectSource([effect]),
      new DebugRuntimeSource([debugMod]),
    ];
    const all = sources.flatMap((s) => s.getModifiers());

    expect(all).toHaveLength(3);
    expect(all.some((m) => m.sourceType === 'equipment')).toBe(true);
    expect(all.some((m) => m.sourceType === 'buff')).toBe(true);
    expect(all.some((m) => m.sourceType === 'debug')).toBe(true);
  });
});
