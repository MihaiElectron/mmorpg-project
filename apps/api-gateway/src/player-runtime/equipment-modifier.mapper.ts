// apps/api-gateway/src/player-runtime/equipment-modifier.mapper.ts

import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { RuntimeModifier, StatKey } from './player-runtime.types';

/**
 * Mapping des champs stat d'un Item vers les StatKey du Runtime.
 *
 * Règle : aucune logique item-spécifique ici.
 * Chaque champ numérique de l'Item qui correspond à une StatKey
 * produit un RuntimeModifier flat. La source reste opaque pour le calculator.
 *
 * item.range : exprimé en pixels dans la DB (commentaire original).
 * Mappé tel quel vers attackRange. Ne pas convertir — le gameplay
 * n'utilise pas encore attackRange. Migration WU à prévoir au moment
 * où la mécanique sera activée.
 */
const ITEM_STAT_MAP: Array<{ field: 'attack' | 'defense' | 'range'; stat: StatKey }> = [
  { field: 'attack', stat: 'attackPower' },
  { field: 'defense', stat: 'defenseTotal' },
  { field: 'range', stat: 'attackRange' },
];

/**
 * Convertit la liste d'équipement actif d'un personnage en RuntimeModifier[].
 *
 * - Un item avec attack=0 ou attack=null ne produit aucun modifier.
 * - sourceLabel = item.name (lisible dans la trace Studio).
 * - id = `${equipment.id}:${stat}` — unique par ligne d'équipement et par stat.
 * - priority = 10 — fixe pour l'équipement (buffs/talents utiliseront d'autres priorités).
 * - Si item n'est pas chargé (relation absente), la ligne est ignorée silencieusement.
 */
export function equipmentToModifiers(equipment: CharacterEquipment[]): RuntimeModifier[] {
  const modifiers: RuntimeModifier[] = [];

  for (const equip of equipment) {
    if (!equip.item) continue;

    for (const { field, stat } of ITEM_STAT_MAP) {
      const value = equip.item[field];
      if (value == null || value === 0) continue;

      modifiers.push({
        id: `${equip.id}:${stat}`,
        sourceType: 'equipment',
        sourceId: equip.itemId,
        sourceLabel: equip.item.name,
        targetStat: stat,
        operation: 'flat',
        value,
        priority: 10,
        enabled: true,
      });
    }
  }

  return modifiers;
}
