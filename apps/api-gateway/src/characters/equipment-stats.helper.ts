import { EntityManager } from 'typeorm';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { CharacterStatsCalculator, DerivedStatModifiers, PRIMARY_STAT_KEYS, PrimaryStats } from './character-stats-calculator';
import { DerivedStatDefinition } from '../derived-stats/entities/derived-stat-definition.entity';
import { MASTERY_IMPLEMENTED_DERIVED_KEYS } from '../derived-stats/derived-stats.constants';

/** Ensemble des clés primaires (lookup O(1)) — jamais des stats secondaires. */
const PRIMARY_STAT_KEY_SET: ReadonlySet<string> = new Set(PRIMARY_STAT_KEYS as readonly string[]);

/**
 * Clés de stats SECONDAIRES (dérivées) autorisées dans `item.statBonuses`.
 * Source de vérité = les `DerivedStatDefinition` fournies : une stat est
 * autorisée ssi `enabled` ET `runtimeStatus === 'implemented'` (réellement
 * consommée par un hook gameplay). Fallback sur la constante statique
 * `MASTERY_IMPLEMENTED_DERIVED_KEYS` si aucune définition n'est fournie
 * (même pattern défensif que `computeDerivedFromDefinitions`). Les clés
 * primaires sont toujours exclues (elles relèvent du chemin primaire).
 */
export function resolveAllowedSecondaryStatKeys(
  definitions?: DerivedStatDefinition[] | null,
): ReadonlySet<string> {
  if (definitions && definitions.length > 0) {
    const out = new Set<string>();
    for (const d of definitions) {
      if (d.enabled && d.runtimeStatus === 'implemented' && !PRIMARY_STAT_KEY_SET.has(d.key)) {
        out.add(d.key);
      }
    }
    return out;
  }
  return new Set(
    (MASTERY_IMPLEMENTED_DERIVED_KEYS as readonly string[]).filter((k) => !PRIMARY_STAT_KEY_SET.has(k)),
  );
}

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
 * Nettoie un `statBonuses` brut d'item en conservant, dans un SEUL bag JSONB,
 * les clés PRIMAIRES connues (via `sanitizeStatBonuses`) ET les clés
 * SECONDAIRES autorisées (dérivées `implemented`, cf.
 * `resolveAllowedSecondaryStatKeys`). Valeurs numériques finies uniquement
 * (négatifs autorisés = malus). Toute clé inconnue est REJETÉE. Aucune I/O.
 *
 * Ne calcule aucune stat : c'est uniquement la whitelist de persistance côté
 * serveur (le Studio propose, le serveur reste autoritaire).
 */
export function sanitizeItemStatBonuses(
  raw: unknown,
  definitions?: DerivedStatDefinition[] | null,
): Record<string, number> {
  const out: Record<string, number> = { ...sanitizeStatBonuses(raw) };
  if (!raw || typeof raw !== 'object') return out;
  const record = raw as Record<string, unknown>;
  const allowedSecondary = resolveAllowedSecondaryStatKeys(definitions);
  for (const key of allowedSecondary) {
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
 * Agrège les bonus de stats SECONDAIRES (dérivées) des items équipés en
 * `DerivedStatModifiers` — **`flat` uniquement**, `percent` toujours vide.
 * PURE (aucune I/O). Ne lit que les clés secondaires AUTORISÉES
 * (`resolveAllowedSecondaryStatKeys`) : primaires et clés inconnues ignorées.
 *
 * Le résultat est destiné à être fusionné (via `mergeDerivedStatModifiers`)
 * avec les modificateurs de maîtrise puis passé à
 * `CharacterStatsCalculator.compute` — MÊME canal existant, aucune formule
 * combat modifiée. NON encore branché aux consommateurs (lot 2).
 */
export function aggregateEquipmentDerivedModifiers(
  equipment: CharacterEquipment[] | undefined | null,
  definitions?: DerivedStatDefinition[] | null,
): DerivedStatModifiers {
  const flat: Record<string, number> = {};
  if (!equipment || equipment.length === 0) return { percent: {}, flat };
  const allowedSecondary = resolveAllowedSecondaryStatKeys(definitions);
  for (const eq of equipment) {
    const raw = eq.item?.statBonuses;
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    for (const key of allowedSecondary) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        flat[key] = (flat[key] ?? 0) + value;
      }
    }
  }
  return { percent: {}, flat };
}

/**
 * Fusionne plusieurs `DerivedStatModifiers` en un seul (somme par clé sur
 * `percent` ET `flat`). PURE et défensive : entrées null/undefined ignorées,
 * valeurs non finies ignorées. Utilisée pour combiner modificateurs de
 * maîtrise + modificateurs d'équipement avant `compute`.
 */
export function mergeDerivedStatModifiers(
  ...mods: (DerivedStatModifiers | null | undefined)[]
): DerivedStatModifiers {
  const percent: Record<string, number> = {};
  const flat: Record<string, number> = {};
  for (const m of mods) {
    if (!m) continue;
    for (const [key, value] of Object.entries(m.percent ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) percent[key] = (percent[key] ?? 0) + value;
    }
    for (const [key, value] of Object.entries(m.flat ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value)) flat[key] = (flat[key] ?? 0) + value;
    }
  }
  return { percent, flat };
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

/**
 * Clampe `health`/`mana`/`energy` aux max DÉRIVÉS serveur (équipement inclus)
 * dans la transaction de l'appelant (Équipement V1-C-B). Ne fait que RÉDUIRE :
 * si un max baisse (statBonus retiré/diminué), la ressource courante est capée ;
 * si un max monte, on ne remplit pas (cohérent avec allocateStats/join/respawn).
 * Persiste uniquement en cas de changement. Aucune régénération inventée.
 *
 * PURE côté logique de calcul (délègue à `CharacterStatsCalculator.compute`) ;
 * l'I/O (find/update) reste ici, via le `manager` fourni. `definitions` est
 * passé par l'appelant (chargé depuis `DerivedStatsService`) pour ne pas coupler
 * ce helper au service de dérivées.
 */
export async function clampCharacterResourcesToDerivedMax(
  manager: EntityManager,
  characterId: string,
  definitions: DerivedStatDefinition[],
  // Modificateurs post-dérivées (maîtrises, Mastery Effects V2) fournis par
  // l'appelant : sans eux, les max calculés seraient sous-estimés et le clamp
  // rognerait des ressources légitimes.
  derivedModifiers?: DerivedStatModifiers | null,
): Promise<void> {
  const [character, equipment] = await Promise.all([
    manager.findOne(Character, { where: { id: characterId } }),
    manager.find(CharacterEquipment, { where: { characterId }, relations: ['item'] }),
  ]);
  if (!character) return;

  const derived = CharacterStatsCalculator.compute(
    character,
    definitions,
    aggregateEquipmentBonuses(equipment),
    // V5-F : les stats secondaires d'équipement (flat, ex. maxHealth) rejoignent
    // les modificateurs fournis par l'appelant — le clamp respecte les max réels
    // équipés et ne rogne pas une ressource légitimement augmentée par un item.
    mergeDerivedStatModifiers(derivedModifiers, aggregateEquipmentDerivedModifiers(equipment, definitions)),
  ).derived;
  const maxHealth = Math.max(1, Math.round(derived.maxHealth));
  const maxMana = Math.max(0, Math.round(derived.maxMana));
  const maxEnergy = Math.max(0, Math.round(derived.maxEnergy));

  const health = Math.min(character.health ?? 0, maxHealth);
  const mana = Math.min(character.mana ?? 0, maxMana);
  const energy = Math.min(character.energy ?? 0, maxEnergy);

  if (health !== character.health || mana !== character.mana || energy !== character.energy) {
    await manager.update(Character, { id: characterId }, { health, mana, energy });
  }
}
