import {
  resolveEffectiveAttackRangeWU,
  MELEE_RANGE_WU,
} from './attack-range.helper';
import { EquipmentSlot } from './dto/equip-item.dto';
import { CharacterEquipment } from './entities/character-equipment.entity';

// legacyRadiusToWU(px) = px × 16 : 46→736, 80→1280, 300→4800.
const RANGED_DEFAULT_WU = 4800;

function eq(slot: EquipmentSlot, item: Record<string, unknown>): CharacterEquipment {
  return { slot, item } as unknown as CharacterEquipment;
}

describe('resolveEffectiveAttackRangeWU', () => {
  it('sans arme → MELEE_RANGE_WU (1280)', () => {
    expect(resolveEffectiveAttackRangeWU([])).toBe(MELEE_RANGE_WU);
    expect(resolveEffectiveAttackRangeWU(null)).toBe(MELEE_RANGE_WU);
    expect(resolveEffectiveAttackRangeWU(undefined)).toBe(MELEE_RANGE_WU);
  });

  describe('arme de mêlée (main droite / type weapon)', () => {
    const melee = (range: number | null | undefined) =>
      [eq(EquipmentSlot.RIGHT_HAND, { type: 'weapon', range })];

    it('range null → MELEE_RANGE_WU', () => {
      expect(resolveEffectiveAttackRangeWU(melee(null))).toBe(1280);
    });
    it('range undefined → MELEE_RANGE_WU', () => {
      expect(resolveEffectiveAttackRangeWU(melee(undefined))).toBe(1280);
    });
    it('range 0 → MELEE_RANGE_WU (fallback sécurisé)', () => {
      expect(resolveEffectiveAttackRangeWU(melee(0))).toBe(1280);
    });
    it('range négatif → MELEE_RANGE_WU', () => {
      expect(resolveEffectiveAttackRangeWU(melee(-5))).toBe(1280);
    });
    it('range NaN → MELEE_RANGE_WU', () => {
      expect(resolveEffectiveAttackRangeWU(melee(NaN))).toBe(1280);
    });
    it('range 46 → 736 WU', () => {
      expect(resolveEffectiveAttackRangeWU(melee(46))).toBe(736);
    });
    it('range 80 → 1280 WU', () => {
      expect(resolveEffectiveAttackRangeWU(melee(80))).toBe(1280);
    });
  });

  describe('arme à distance (slot ranged-weapon)', () => {
    const ranged = (range: number | null | undefined) =>
      [eq(EquipmentSlot.RANGED_WEAPON, { type: 'weapon', range })];

    it('range null → RANGED_RANGE_DEFAULT (4800 WU)', () => {
      expect(resolveEffectiveAttackRangeWU(ranged(null))).toBe(RANGED_DEFAULT_WU);
    });
    it('range 0 → RANGED_RANGE_DEFAULT (4800 WU)', () => {
      expect(resolveEffectiveAttackRangeWU(ranged(0))).toBe(RANGED_DEFAULT_WU);
    });
    it('range 300 → 4800 WU', () => {
      expect(resolveEffectiveAttackRangeWU(ranged(300))).toBe(4800);
    });
  });

  it('priorité : arme à distance prioritaire sur arme de mêlée', () => {
    const both = [
      eq(EquipmentSlot.RIGHT_HAND, { type: 'weapon', range: 80 }),
      eq(EquipmentSlot.RANGED_WEAPON, { type: 'weapon', range: 300 }),
    ];
    expect(resolveEffectiveAttackRangeWU(both)).toBe(4800); // valeur ranged
  });

  it('ignore un objet non-arme en main (type != weapon) → défaut mêlée', () => {
    const shield = [eq(EquipmentSlot.RIGHT_HAND, { type: 'armor', range: 10 })];
    expect(resolveEffectiveAttackRangeWU(shield)).toBe(MELEE_RANGE_WU);
  });
});
