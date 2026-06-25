// apps/api-gateway/src/player-runtime/debug-modifier.registry.spec.ts

import { DebugModifierRegistry, DebugModifierInput } from './debug-modifier.registry';

function makeInput(overrides: Partial<DebugModifierInput> = {}): DebugModifierInput {
  return {
    targetStat: 'attackPower',
    operation: 'flat',
    value: 10,
    ...overrides,
  };
}

describe('DebugModifierRegistry', () => {
  let registry: DebugModifierRegistry;

  beforeEach(() => {
    registry = new DebugModifierRegistry();
  });

  describe('getModifiers', () => {
    it('retourne [] si aucun modifier pour ce characterId', () => {
      expect(registry.getModifiers('char-1')).toEqual([]);
    });

    it("ne mélange pas les modifiers de deux personnages différents", () => {
      registry.addModifier('char-1', makeInput({ value: 5 }));
      expect(registry.getModifiers('char-2')).toEqual([]);
    });
  });

  describe('addModifier', () => {
    it('ajoute un modifier et le retourne avec un id généré', () => {
      const mod = registry.addModifier('char-1', makeInput({ value: 15 }));

      expect(mod.id).toMatch(/^debug:char-1:/);
      expect(mod.sourceType).toBe('debug');
      expect(mod.targetStat).toBe('attackPower');
      expect(mod.value).toBe(15);
      expect(mod.enabled).toBe(true);
      expect(mod.priority).toBe(99);
    });

    it('sourceLabel par défaut = "Debug"', () => {
      const mod = registry.addModifier('char-1', makeInput());
      expect(mod.sourceLabel).toBe('Debug');
    });

    it('sourceLabel personnalisé est utilisé', () => {
      const mod = registry.addModifier('char-1', makeInput({ sourceLabel: 'Test Rage' }));
      expect(mod.sourceLabel).toBe('Test Rage');
    });

    it('reason est propagée', () => {
      const mod = registry.addModifier('char-1', makeInput({ reason: 'test de pipeline' }));
      expect(mod.reason).toBe('test de pipeline');
    });

    it('les ids sont uniques entre deux appels', () => {
      const m1 = registry.addModifier('char-1', makeInput());
      const m2 = registry.addModifier('char-1', makeInput());
      expect(m1.id).not.toBe(m2.id);
    });

    it('les ids sont uniques entre deux personnages', () => {
      const m1 = registry.addModifier('char-1', makeInput());
      const m2 = registry.addModifier('char-2', makeInput());
      expect(m1.id).not.toBe(m2.id);
    });

    it('plusieurs appels accumulent les modifiers', () => {
      registry.addModifier('char-1', makeInput({ value: 5 }));
      registry.addModifier('char-1', makeInput({ value: 10 }));
      expect(registry.getModifiers('char-1')).toHaveLength(2);
    });

    it('getModifiers reflète le modifier ajouté', () => {
      const mod = registry.addModifier('char-1', makeInput({ value: 7 }));
      const mods = registry.getModifiers('char-1');
      expect(mods).toHaveLength(1);
      expect(mods[0]).toBe(mod);
    });

    it('sourceId = "debug-registry"', () => {
      const mod = registry.addModifier('char-1', makeInput());
      expect(mod.sourceId).toBe('debug-registry');
    });

    it('opération percent_add supportée', () => {
      const mod = registry.addModifier('char-1', makeInput({ operation: 'percent_add', value: 20 }));
      expect(mod.operation).toBe('percent_add');
    });

    it('stat defenseTotal supportée', () => {
      const mod = registry.addModifier('char-1', makeInput({ targetStat: 'defenseTotal', value: 5 }));
      expect(mod.targetStat).toBe('defenseTotal');
    });
  });

  describe('clearModifiers', () => {
    it('supprime tous les modifiers du personnage', () => {
      registry.addModifier('char-1', makeInput());
      registry.addModifier('char-1', makeInput());
      registry.clearModifiers('char-1');
      expect(registry.getModifiers('char-1')).toEqual([]);
    });

    it("ne touche pas aux modifiers d'un autre personnage", () => {
      registry.addModifier('char-1', makeInput({ value: 5 }));
      registry.addModifier('char-2', makeInput({ value: 10 }));
      registry.clearModifiers('char-1');
      expect(registry.getModifiers('char-2')).toHaveLength(1);
    });

    it("clear sans modifier préalable ne lève pas d'erreur", () => {
      expect(() => registry.clearModifiers('char-unknown')).not.toThrow();
    });
  });

  describe('listModifiers', () => {
    it('retourne [] si aucun modifier', () => {
      expect(registry.listModifiers('char-1')).toEqual([]);
    });

    it('retourne la même liste que getModifiers', () => {
      registry.addModifier('char-1', makeInput({ value: 3 }));
      registry.addModifier('char-1', makeInput({ value: 7 }));
      expect(registry.listModifiers('char-1')).toEqual(registry.getModifiers('char-1'));
    });
  });

  describe('isolation entre personnages', () => {
    it('les modifiers de char-1 et char-2 sont indépendants', () => {
      registry.addModifier('char-1', makeInput({ value: 5 }));
      registry.addModifier('char-1', makeInput({ value: 10 }));
      registry.addModifier('char-2', makeInput({ value: 99 }));

      expect(registry.getModifiers('char-1')).toHaveLength(2);
      expect(registry.getModifiers('char-2')).toHaveLength(1);
      expect(registry.getModifiers('char-2')[0].value).toBe(99);
    });
  });
});
