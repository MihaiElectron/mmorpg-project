import { resolveEquippedWeaponType } from './equipped-weapon.helper';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { EquipmentSlot } from './dto/equip-item.dto';

function eq(
  slot: EquipmentSlot,
  item: { type?: string; weaponType?: string | null } | null,
): CharacterEquipment {
  return { slot, item } as unknown as CharacterEquipment;
}

describe('resolveEquippedWeaponType', () => {
  it('retourne null sans équipement (vide, null, undefined)', () => {
    expect(resolveEquippedWeaponType([])).toBeNull();
    expect(resolveEquippedWeaponType(null)).toBeNull();
    expect(resolveEquippedWeaponType(undefined)).toBeNull();
  });

  it("retourne le weaponType de l'arme de mêlée main droite", () => {
    const equipment = [
      eq(EquipmentSlot.RIGHT_HAND, { type: 'weapon', weaponType: 'two_handed_sword' }),
    ];
    expect(resolveEquippedWeaponType(equipment)).toBe('two_handed_sword');
  });

  it("retourne le weaponType de l'arme de mêlée main gauche", () => {
    const equipment = [
      eq(EquipmentSlot.LEFT_HAND, { type: 'weapon', weaponType: 'dagger' }),
    ];
    expect(resolveEquippedWeaponType(equipment)).toBe('dagger');
  });

  it("priorité à l'arme à distance sur l'arme de mêlée", () => {
    const equipment = [
      eq(EquipmentSlot.RIGHT_HAND, { type: 'weapon', weaponType: 'two_handed_sword' }),
      eq(EquipmentSlot.RANGED_WEAPON, { type: 'weapon', weaponType: 'bow' }),
    ];
    expect(resolveEquippedWeaponType(equipment)).toBe('bow');
  });

  it('retourne null si les armes équipées sont sans weaponType', () => {
    const equipment = [
      eq(EquipmentSlot.RIGHT_HAND, { type: 'weapon', weaponType: null }),
    ];
    expect(resolveEquippedWeaponType(equipment)).toBeNull();
  });

  it("ignore un item main droite qui n'est pas de type weapon", () => {
    const equipment = [
      eq(EquipmentSlot.RIGHT_HAND, { type: 'tool', weaponType: 'two_handed_axe' }),
    ];
    expect(resolveEquippedWeaponType(equipment)).toBeNull();
  });

  it('ignore les slots non-arme (accessoires)', () => {
    const equipment = [
      eq(EquipmentSlot.LEFT_EARRING, { type: 'accessory', weaponType: null }),
      eq(EquipmentSlot.CHEST_ARMOR, { type: 'armor' }),
    ];
    expect(resolveEquippedWeaponType(equipment)).toBeNull();
  });

  it("arme à distance sans weaponType ne masque pas la mêlée (fallback historique)", () => {
    // ranged sans weaponType → on retombe sur la mêlée, comme l'ancien
    // resolveCombatMasteryKey (le find ranged matche mais weaponType est falsy).
    const equipment = [
      eq(EquipmentSlot.RANGED_WEAPON, { type: 'weapon', weaponType: null }),
      eq(EquipmentSlot.RIGHT_HAND, { type: 'weapon', weaponType: 'two_handed_sword' }),
    ];
    expect(resolveEquippedWeaponType(equipment)).toBe('two_handed_sword');
  });
});
