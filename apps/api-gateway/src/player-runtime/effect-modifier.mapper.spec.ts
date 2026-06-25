// apps/api-gateway/src/player-runtime/effect-modifier.mapper.spec.ts

import { effectToModifiers } from './effect-modifier.mapper';
import { PlayerRuntimeEffect } from './player-runtime.types';

const FUTURE = new Date(Date.now() + 60_000);
const PAST   = new Date(Date.now() - 60_000);
const NOW    = new Date();

function makeEffect(overrides: Partial<PlayerRuntimeEffect> = {}): PlayerRuntimeEffect {
  return {
    id: 'effect-1',
    sourceType: 'buff',
    sourceId: 'buff-rage',
    sourceLabel: 'Rage',
    modifiers: [{ targetStat: 'attackPower', operation: 'flat', value: 10 }],
    enabled: true,
    ...overrides,
  };
}

describe('effectToModifiers', () => {
  it('retourne [] pour une liste vide', () => {
    expect(effectToModifiers([])).toEqual([]);
  });

  it('retourne [] si effect.enabled est false', () => {
    expect(effectToModifiers([makeEffect({ enabled: false })])).toEqual([]);
  });

  it('retourne [] si expiresAt est dans le passé', () => {
    expect(effectToModifiers([makeEffect({ expiresAt: PAST })], NOW)).toEqual([]);
  });

  it('inclut l\'effet si expiresAt est dans le futur', () => {
    const mods = effectToModifiers([makeEffect({ expiresAt: FUTURE })], NOW);
    expect(mods).toHaveLength(1);
  });

  it('inclut l\'effet si expiresAt est absent', () => {
    const mods = effectToModifiers([makeEffect({ expiresAt: undefined })]);
    expect(mods).toHaveLength(1);
  });

  it('produit un RuntimeModifier par EffectModifierDef', () => {
    const effect = makeEffect({
      modifiers: [
        { targetStat: 'attackPower', operation: 'flat', value: 10 },
        { targetStat: 'maxHp', operation: 'percent_add', value: 20 },
      ],
    });
    const mods = effectToModifiers([effect]);
    expect(mods).toHaveLength(2);
  });

  it('hérite sourceType, sourceId et sourceLabel de l\'effet', () => {
    const effect = makeEffect({ sourceType: 'debuff', sourceId: 'db-1', sourceLabel: 'Poison' });
    const mods = effectToModifiers([effect]);
    expect(mods[0].sourceType).toBe('debuff');
    expect(mods[0].sourceId).toBe('db-1');
    expect(mods[0].sourceLabel).toBe('Poison');
  });

  it('id unique : ${effect.id}:${stat}:${index}', () => {
    const effect = makeEffect({
      id: 'eff-abc',
      modifiers: [
        { targetStat: 'attackPower', operation: 'flat', value: 5 },
        { targetStat: 'attackPower', operation: 'flat', value: 3 },
      ],
    });
    const mods = effectToModifiers([effect]);
    expect(mods[0].id).toBe('eff-abc:attackPower:0');
    expect(mods[1].id).toBe('eff-abc:attackPower:1');
  });

  it('priorité par défaut = 20', () => {
    const mods = effectToModifiers([makeEffect()]);
    expect(mods[0].priority).toBe(20);
  });

  it('priorité explicite dans EffectModifierDef l\'emporte', () => {
    const effect = makeEffect({
      modifiers: [{ targetStat: 'attackPower', operation: 'flat', value: 5, priority: 5 }],
    });
    const mods = effectToModifiers([effect]);
    expect(mods[0].priority).toBe(5);
  });

  it('reason héritée de l\'effet', () => {
    const effect = makeEffect({ reason: 'Potion de rage bue' });
    const mods = effectToModifiers([effect]);
    expect(mods[0].reason).toBe('Potion de rage bue');
  });

  it('enabled = true sur tous les modifiers produits', () => {
    const mods = effectToModifiers([makeEffect()]);
    expect(mods.every((m) => m.enabled)).toBe(true);
  });

  it('sourceType consumable supporté', () => {
    const effect = makeEffect({ sourceType: 'consumable', sourceLabel: 'Potion de force' });
    const mods = effectToModifiers([effect]);
    expect(mods[0].sourceType).toBe('consumable');
  });

  it('sourceType aura supporté', () => {
    const effect = makeEffect({ sourceType: 'aura', sourceLabel: 'Aura de protection' });
    const mods = effectToModifiers([effect]);
    expect(mods[0].sourceType).toBe('aura');
  });

  it('sourceType event supporté', () => {
    const effect = makeEffect({ sourceType: 'event', sourceLabel: 'Zone de feu' });
    const mods = effectToModifiers([effect]);
    expect(mods[0].sourceType).toBe('event');
  });

  it('agrège les modifiers de plusieurs effets actifs', () => {
    const rage  = makeEffect({ id: 'e1', sourceLabel: 'Rage',  modifiers: [{ targetStat: 'attackPower', operation: 'flat', value: 10 }] });
    const armor = makeEffect({ id: 'e2', sourceType: 'buff', sourceLabel: 'Shield', modifiers: [{ targetStat: 'defenseTotal', operation: 'flat', value: 5 }] });
    const mods  = effectToModifiers([rage, armor]);
    expect(mods).toHaveLength(2);
    expect(mods.find((m) => m.sourceLabel === 'Rage')?.value).toBe(10);
    expect(mods.find((m) => m.sourceLabel === 'Shield')?.value).toBe(5);
  });

  it("l'expiration n'empêche pas les autres effets d'être inclus", () => {
    const expired = makeEffect({ id: 'e1', expiresAt: PAST });
    const active  = makeEffect({ id: 'e2', sourceLabel: 'Permanent' });
    const mods    = effectToModifiers([expired, active], NOW);
    expect(mods).toHaveLength(1);
    expect(mods[0].sourceLabel).toBe('Permanent');
  });

  it('percent_add supporté', () => {
    const effect = makeEffect({ modifiers: [{ targetStat: 'maxHp', operation: 'percent_add', value: 25 }] });
    const mods = effectToModifiers([effect]);
    expect(mods[0].operation).toBe('percent_add');
    expect(mods[0].value).toBe(25);
  });

  it('percent_multiply supporté', () => {
    const effect = makeEffect({ modifiers: [{ targetStat: 'defenseTotal', operation: 'percent_multiply', value: 50 }] });
    const mods = effectToModifiers([effect]);
    expect(mods[0].operation).toBe('percent_multiply');
  });
});
