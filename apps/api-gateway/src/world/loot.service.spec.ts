import { LootService } from './loot.service';
import type { LootPoolEntry } from './loot.service';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<LootPoolEntry> = {}): LootPoolEntry {
  return {
    itemId: 'wooden_stick',
    minQty: 1,
    maxQty: 1,
    probability: 1,
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('LootService', () => {
  let service: LootService;

  beforeEach(() => {
    service = new LootService();
  });

  // ── generateLoot — API legacy ────────────────────────────────────────────────

  describe('generateLoot — legacy switch', () => {
    it('dead_tree → wooden_stick', () => {
      expect(service.generateLoot('dead_tree')).toEqual([{ itemId: 'wooden_stick', quantity: 1 }]);
    });

    it('ore → iron_ore', () => {
      expect(service.generateLoot('ore')).toEqual([{ itemId: 'iron_ore', quantity: 1 }]);
    });

    it('type inconnu → tableau vide', () => {
      expect(service.generateLoot('unknown_plant')).toEqual([]);
    });
  });

  // ── generateLoot — pool template ─────────────────────────────────────────────

  describe('generateLoot — pool template', () => {
    it('dead_tree avec pool wooden_stick → wooden_stick', () => {
      const pool = [makeEntry({ itemId: 'wooden_stick', probability: 1 })];
      expect(service.generateLoot('dead_tree', pool)).toEqual([{ itemId: 'wooden_stick', quantity: 1 }]);
    });

    it('ore avec pool iron_ore → iron_ore', () => {
      const pool = [makeEntry({ itemId: 'iron_ore', probability: 1 })];
      expect(service.generateLoot('ore', pool)).toEqual([{ itemId: 'iron_ore', quantity: 1 }]);
    });

    it('pool vide → fallback legacy dead_tree → wooden_stick', () => {
      expect(service.generateLoot('dead_tree', [])).toEqual([{ itemId: 'wooden_stick', quantity: 1 }]);
    });

    it('pool null → fallback legacy dead_tree → wooden_stick', () => {
      expect(service.generateLoot('dead_tree', null)).toEqual([{ itemId: 'wooden_stick', quantity: 1 }]);
    });

    it('entrée avec itemId vide → invalide → fallback legacy', () => {
      const pool = [makeEntry({ itemId: '' })];
      expect(service.generateLoot('dead_tree', pool)).toEqual([{ itemId: 'wooden_stick', quantity: 1 }]);
    });

    it('entrée avec probability 0 → jamais tirée → fallback legacy', () => {
      const pool = [makeEntry({ itemId: 'rare_gem', probability: 0 })];
      expect(service.generateLoot('dead_tree', pool)).toEqual([{ itemId: 'wooden_stick', quantity: 1 }]);
    });

    it('type inconnu avec pool probability 0 → tableau vide', () => {
      const pool = [makeEntry({ itemId: 'rare_gem', probability: 0 })];
      expect(service.generateLoot('unknown_plant', pool)).toEqual([]);
    });
  });

  // ── generateLootFromPool — quantité ─────────────────────────────────────────

  describe('generateLootFromPool — quantité min/max', () => {
    it('minQty === maxQty → quantité fixe', () => {
      const pool = [makeEntry({ itemId: 'leaf', minQty: 3, maxQty: 3, probability: 1 })];
      expect(service.generateLootFromPool(pool)).toEqual({ itemId: 'leaf', quantity: 3 });
    });

    it('pool invalide (minQty 0) → null', () => {
      const pool = [makeEntry({ minQty: 0, probability: 1 })];
      expect(service.generateLootFromPool(pool)).toBeNull();
    });

    it('pool invalide (maxQty < minQty) → null', () => {
      const pool = [makeEntry({ minQty: 5, maxQty: 2, probability: 1 })];
      expect(service.generateLootFromPool(pool)).toBeNull();
    });
  });
});
