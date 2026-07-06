import { CharacterEquipment } from './entities/character-equipment.entity';
import { EquipmentSlot } from './dto/equip-item.dto';
import { legacyRadiusToWU } from '../common/legacy-pixel-position.adapter';

/**
 * Portée d'attaque effective du personnage (WU) — source serveur unique.
 * ---------------------------------------------------------------------------
 * Ce helper PUR est la seule référence de portée : réutilisé par
 * `CreaturesService.attack()` (validation de distance) ET par la projection
 * `/characters/me` (`combat.attackRangeWU`). Aucun recalcul côté client.
 *
 * Comportement (identique à l'ancien `resolveAttackRange`) :
 * - sans arme → MELEE_RANGE_WU ;
 * - arme de mêlée (main droite/gauche, type "weapon") :
 *     range null/undefined/≤0/NaN → MELEE_RANGE_WU ; range > 0 → legacyRadiusToWU(range) ;
 * - arme à distance (slot ranged-weapon) :
 *     range null/undefined/≤0/NaN → legacyRadiusToWU(RANGED_RANGE_DEFAULT_PX) ; range > 0 → legacyRadiusToWU(range).
 * La priorité distance > mêlée > défaut est conservée.
 */

// Portée mêlée par défaut en WU (distance Chebyshev). 1280 WU = 1,25 tuile
// (TILE_SIZE_WU = 1024) : couvre un attaquant sur une tuile adjacente + marge.
export const MELEE_RANGE_WU = 1280;

// Portée à distance par défaut, en pixels legacy (convertie en WU).
export const RANGED_RANGE_DEFAULT_PX = 300;

/**
 * Portée d'une arme en WU avec fallback sécurisé : une portée non finie / null /
 * <= 0 (donnée mal configurée) ne doit jamais produire une portée effective 0.
 */
function safeWeaponRangeWU(
  rawRange: number | null | undefined,
  defaultWU: number,
): number {
  if (typeof rawRange === 'number' && Number.isFinite(rawRange) && rawRange > 0) {
    return legacyRadiusToWU(rawRange);
  }
  return defaultWU;
}

export function resolveEffectiveAttackRangeWU(
  equipment: CharacterEquipment[] | null | undefined,
): number {
  const items = equipment ?? [];

  const ranged = items.find(
    (eq) => (eq.slot as EquipmentSlot) === EquipmentSlot.RANGED_WEAPON && eq.item,
  );
  if (ranged) {
    return safeWeaponRangeWU(ranged.item.range, legacyRadiusToWU(RANGED_RANGE_DEFAULT_PX));
  }

  const melee = items.find(
    (eq) =>
      ((eq.slot as EquipmentSlot) === EquipmentSlot.RIGHT_HAND ||
        (eq.slot as EquipmentSlot) === EquipmentSlot.LEFT_HAND) &&
      eq.item?.type === 'weapon',
  );
  // Fallback mêlée = MELEE_RANGE_WU (jamais le legacy 60 px = 960 WU, plus court qu'une tuile).
  if (melee) return safeWeaponRangeWU(melee.item.range, MELEE_RANGE_WU);

  return MELEE_RANGE_WU;
}
