import { CharacterEquipment } from './entities/character-equipment.entity';
import { EquipmentSlot } from './dto/equip-item.dto';

/**
 * WeaponType de l'arme équipée (V1-D-Skills-A) — source serveur UNIQUE.
 * ---------------------------------------------------------------------------
 * Helper PUR (aucune I/O), même pattern que `attack-range.helper.ts` :
 * partagé entre l'auto-attaque (`CreaturesService` — XP mastery via
 * `resolveCombatMasteryKey` et effets de maîtrise V1-D-B) et, à terme, le
 * cast de skill (V1-D-Skills-B). Aucun recalcul côté client.
 *
 * Règle (identique à l'historique `CreaturesService.resolveEquippedWeaponType`) :
 * - priorité arme à distance (slot ranged-weapon) > arme de mêlée
 *   (main droite/gauche, type "weapon") — même priorité que la portée ;
 * - null = pas d'arme équipée, ou arme sans `weaponType` configuré.
 */
export function resolveEquippedWeaponType(
  equipment: CharacterEquipment[] | null | undefined,
): string | null {
  const items = equipment ?? [];

  const ranged = items.find(
    (eq) => (eq.slot as EquipmentSlot) === EquipmentSlot.RANGED_WEAPON && eq.item,
  );
  if (ranged?.item?.weaponType) return ranged.item.weaponType;

  const melee = items.find(
    (eq) =>
      ((eq.slot as EquipmentSlot) === EquipmentSlot.RIGHT_HAND ||
        (eq.slot as EquipmentSlot) === EquipmentSlot.LEFT_HAND) &&
      eq.item?.type === 'weapon',
  );
  if (melee?.item?.weaponType) return melee.item.weaponType;

  return null;
}
