import { EntityManager } from 'typeorm';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';

/**
 * Recalcule les stats finales d'un personnage depuis ses CharacterEquipment actifs.
 * Doit être appelé dans la même transaction que la mutation d'équipement.
 *
 * attack  = baseAttack  + Σ item.attack  des CharacterEquipment actifs
 * defense = baseDefense + Σ item.defense des CharacterEquipment actifs
 *
 * Les valeurs null sur item.attack/defense sont traitées comme 0.
 * baseAttack/baseDefense sont lus depuis la DB et ne sont jamais modifiés ici.
 */
export async function recalculateEquipmentStats(
  manager: EntityManager,
  characterId: string,
): Promise<void> {
  const [character, rows] = await Promise.all([
    manager.findOne(Character, { where: { id: characterId } }),
    manager.find(CharacterEquipment, { where: { characterId }, relations: ['item'] }),
  ]);

  if (!character) return;

  const equipAttack = rows.reduce((sum, eq) => sum + (eq.item?.attack ?? 0), 0);
  const equipDefense = rows.reduce((sum, eq) => sum + (eq.item?.defense ?? 0), 0);

  const finalAttack =
    character.baseAttack
    + equipAttack;
    // future: + skillAttackModifier(characterId)
    // future: + buffAttackModifier(characterId)
    // future: + talentAttackModifier(characterId)

  const finalDefense =
    character.baseDefense
    + equipDefense;
    // future: + skillDefenseModifier(characterId)
    // future: + buffDefenseModifier(characterId)
    // future: + talentDefenseModifier(characterId)

  await manager.update(Character, { id: characterId }, {
    attack: finalAttack,
    defense: finalDefense,
  });
}
