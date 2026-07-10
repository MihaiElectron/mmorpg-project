import { EntityManager } from 'typeorm';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { PRIMARY_STAT_KEYS, PrimaryStats } from './character-stats-calculator';

/** PrimaryStats à zéro (clone local — évite tout cycle d'import runtime). */
function zeroPrimaryStats(): PrimaryStats {
  return {
    strength: 0,
    vitality: 0,
    endurance: 0,
    agility: 0,
    dexterity: 0,
    intelligence: 0,
    wisdom: 0,
    spirit: 0,
    willpower: 0,
    charisma: 0,
  };
}

/**
 * Nettoie un `statBonuses` brut (JSONB item, éditable via Studio plus tard) :
 * ne conserve que les clés primaires connues (whitelist) et les valeurs
 * numériques finies. Toute clé inconnue ou valeur non finie est ignorée —
 * jamais de confiance au contenu stocké. Retourne un objet partiel.
 */
export function sanitizeStatBonuses(
  raw: unknown,
): Partial<Record<keyof PrimaryStats, number>> {
  const out: Partial<Record<keyof PrimaryStats, number>> = {};
  if (!raw || typeof raw !== 'object') return out;
  const record = raw as Record<string, unknown>;
  for (const key of PRIMARY_STAT_KEYS) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/**
 * Agrège les bonus de stats PRIMAIRES des items équipés (Équipement V1-A).
 * PURE : ne fait AUCUNE I/O — reçoit les `CharacterEquipment` déjà chargés
 * (relation `item`). Point d'agrégation UNIQUE réutilisé par tous les
 * consommateurs de `CharacterStatsCalculator.compute`. Ignore proprement les
 * clés inconnues (sanitize). N'affecte pas `attack`/`defense` plats.
 */
export function aggregateEquipmentBonuses(
  equipment: CharacterEquipment[] | undefined | null,
): PrimaryStats {
  const total = zeroPrimaryStats();
  if (!equipment || equipment.length === 0) return total;
  for (const eq of equipment) {
    const bonuses = sanitizeStatBonuses(eq.item?.statBonuses);
    for (const key of PRIMARY_STAT_KEYS) {
      total[key] += bonuses[key] ?? 0;
    }
  }
  return total;
}

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
    // future: + masteryAttackModifier(characterId)
    // future: + buffAttackModifier(characterId)
    // future: + talentAttackModifier(characterId)

  const finalDefense =
    character.baseDefense
    + equipDefense;
    // future: + masteryDefenseModifier(characterId)
    // future: + buffDefenseModifier(characterId)
    // future: + talentDefenseModifier(characterId)

  await manager.update(Character, { id: characterId }, {
    attack: finalAttack,
    defense: finalDefense,
  });
}
