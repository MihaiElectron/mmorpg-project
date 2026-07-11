import { DerivedStatCategory, DerivedStatDefinition } from './entities/derived-stat-definition.entity';

/** Les 10 clés de stats primaires autorisées comme coefficients. */
export const PRIMARY_STAT_KEYS = [
  'strength',
  'vitality',
  'endurance',
  'agility',
  'dexterity',
  'intelligence',
  'wisdom',
  'spirit',
  'willpower',
  'charisma',
] as const;

export type PrimaryStatKey = (typeof PRIMARY_STAT_KEYS)[number];

/** Libellés FR des 10 stats principales fixes (affichage panneau joueur). */
export const PRIMARY_STAT_LABELS: { key: PrimaryStatKey; label: string }[] = [
  { key: 'strength', label: 'Force' },
  { key: 'vitality', label: 'Vitalité' },
  { key: 'endurance', label: 'Endurance' },
  { key: 'agility', label: 'Agilité' },
  { key: 'dexterity', label: 'Dextérité' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'wisdom', label: 'Sagesse' },
  { key: 'spirit', label: 'Esprit' },
  { key: 'willpower', label: 'Volonté' },
  { key: 'charisma', label: 'Charisme' },
];

/** Colonnes Character brutes utilisables comme `rawStatSource`. */
export const RAW_STAT_SOURCES = ['maxHealth', 'attack', 'defense'] as const;
export type RawStatSource = (typeof RAW_STAT_SOURCES)[number];

/**
 * Dérivées système requises par le combat V1 (creatures.service.ts,
 * world.service.ts) — jamais désactivables via `enabled=false`, qui
 * forcerait leur valeur à 0 (PV max nul, attaque nulle, défense nulle).
 * Leurs coefficients/baseValue/min/max restent librement configurables :
 * seule la désactivation est bloquée. Voir DerivedStatsService.updateDefinition.
 */
export const CRITICAL_DERIVED_STAT_KEYS = ['maxHealth', 'physicalAttack', 'defense'] as const;
export type CriticalDerivedStatKey = (typeof CRITICAL_DERIVED_STAT_KEYS)[number];

/**
 * Dérivées réellement consommées par un hook runtime ET ciblables par les
 * Mastery Effects (V3-B). Sur ces 10 stats, les defaults/seed posent
 * `masteryEligible=true`, `runtimeStatus='implemented'`,
 * `allowedModifierModes=['percentPerLevel','flatPerLevel']`. Les 14 autres
 * dérivées restent `calculatedOnly` (calculées mais non branchées gameplay) —
 * jamais exposées comme targets tant que leur hook n'existe pas.
 */
export const MASTERY_IMPLEMENTED_DERIVED_KEYS = [
  'physicalAttack',
  'defense',
  'maxHealth',
  'maxMana',
  'maxEnergy',
  'healthRegen',
  'manaRegen',
  'energyRegen',
  'healingPower',
  'magicPower',
  // V4-A : premier hook offensif — réduit la défense effective de la cible.
  'defensePenetration',
] as const;

export const DERIVED_STAT_CATEGORIES: { key: DerivedStatCategory; label: string }[] = [
  { key: 'resources', label: 'Ressources' },
  { key: 'offensive', label: 'Offensif' },
  { key: 'defensive', label: 'Défensif' },
  { key: 'elemental_resistance', label: 'Résistances élémentaires' },
  { key: 'mobility_control', label: 'Mobilité / contrôle' },
  { key: 'social_threat', label: 'Social / menace' },
];

/**
 * Defaults V1 — reproduisent EXACTEMENT les formules hardcodées historiques
 * de CharacterStatsCalculator (aucun changement de gameplay). Seule source
 * utilisée pour le seed initial de la table `derived_stat_definition` ET
 * comme fallback en mémoire si la config DB est absente/vide.
 *
 * Ne pas modifier les valeurs ici sans mettre à jour le seed déjà appliqué
 * en DB (ce fichier ne re-seed jamais une table déjà peuplée).
 */
export const DEFAULT_DERIVED_STAT_DEFINITIONS: DerivedStatDefinition[] = [
  // ── Ressources ──────────────────────────────────────────────────────────
  def('maxHealth', 'PV max', 'resources', 1, {
    rawStatSource: 'maxHealth',
    primaryCoefficients: { vitality: 10 },
  }),
  def('maxMana', 'Mana max', 'resources', 2, {
    primaryCoefficients: { intelligence: 10, wisdom: 5 },
  }),
  def('maxEnergy', 'Énergie max', 'resources', 3, {
    primaryCoefficients: { endurance: 8, agility: 2 },
  }),
  def('healthRegen', 'Régén. PV', 'resources', 4, {
    primaryCoefficients: { vitality: 0.5, endurance: 0.2 },
  }),
  def('manaRegen', 'Régén. mana', 'resources', 5, {
    primaryCoefficients: { wisdom: 0.5, intelligence: 0.2 },
  }),
  def('energyRegen', 'Régén. énergie', 'resources', 6, {
    primaryCoefficients: { endurance: 0.3, agility: 0.2 },
  }),

  // ── Offensif ────────────────────────────────────────────────────────────
  def('physicalAttack', 'Attaque physique', 'offensive', 7, {
    rawStatSource: 'attack',
    primaryCoefficients: { strength: 2 },
  }),
  def('magicPower', 'Puissance magique', 'offensive', 8, {
    primaryCoefficients: { intelligence: 2, spirit: 1 },
  }),
  def('healingPower', 'Puissance de soin', 'offensive', 9, {
    primaryCoefficients: { wisdom: 2, spirit: 1 },
  }),
  def('accuracy', 'Précision', 'offensive', 10, {
    primaryCoefficients: { dexterity: 0.5 },
  }),
  // V4-A : pénétration de défense (stat système offensive, hook combat).
  // baseValue 0 + aucun coefficient primaire → neutre tant qu'aucune maîtrise
  // ne l'augmente (flatPerLevel). minValue 0 : jamais négative.
  def('defensePenetration', 'Pénétration de défense', 'offensive', 25, {
    minValue: 0,
    primaryCoefficients: {},
    description:
      'Réduit la défense effective de la cible lors des dégâts physiques.',
  }),
  def('criticalChance', 'Chance critique', 'offensive', 11, {
    primaryCoefficients: { dexterity: 0.3, agility: 0.2 },
    maxValue: 50,
  }),
  def('criticalDamage', 'Dégâts critiques', 'offensive', 12, {
    baseValue: 150,
    primaryCoefficients: { dexterity: 1 },
  }),

  // ── Défensif ────────────────────────────────────────────────────────────
  def('defense', 'Défense', 'defensive', 13, {
    rawStatSource: 'defense',
    primaryCoefficients: { endurance: 1 },
  }),
  def('dodgeChance', 'Esquive', 'defensive', 14, {
    primaryCoefficients: { agility: 0.3 },
    maxValue: 40,
  }),
  def('parryChance', 'Parade', 'defensive', 15, {
    primaryCoefficients: { strength: 0.15, dexterity: 0.15 },
    maxValue: 40,
  }),
  def('blockChance', 'Blocage', 'defensive', 16, {
    primaryCoefficients: { endurance: 0.2, strength: 0.1 },
    maxValue: 40,
  }),

  // ── Résistances élémentaires ────────────────────────────────────────────
  def('magicalResistanceFire', 'Résistance feu', 'elemental_resistance', 17, {
    primaryCoefficients: { spirit: 0.5, wisdom: 0.2 },
  }),
  def('magicalResistanceWater', 'Résistance eau', 'elemental_resistance', 18, {
    primaryCoefficients: { spirit: 0.5, intelligence: 0.2 },
  }),
  def('magicalResistanceAir', 'Résistance air', 'elemental_resistance', 19, {
    primaryCoefficients: { spirit: 0.5, agility: 0.2 },
  }),
  def('magicalResistanceEarth', 'Résistance terre', 'elemental_resistance', 20, {
    primaryCoefficients: { spirit: 0.5, endurance: 0.2 },
  }),

  // ── Mobilité / contrôle ─────────────────────────────────────────────────
  def('attackSpeed', "Vitesse d'attaque", 'mobility_control', 21, {
    baseValue: 100,
    primaryCoefficients: { agility: 0.3 },
  }),
  def('movementSpeed', 'Vitesse de déplacement', 'mobility_control', 22, {
    baseValue: 100,
    primaryCoefficients: { agility: 0.2 },
  }),
  def('controlResistance', 'Résistance aux contrôles', 'mobility_control', 23, {
    primaryCoefficients: { willpower: 0.4 },
    maxValue: 50,
  }),

  // ── Social / menace ─────────────────────────────────────────────────────
  def('threatGeneration', "Génération d'aggro", 'social_threat', 24, {
    primaryCoefficients: { charisma: 0.5, strength: 0.3 },
  }),
];

function def(
  key: string,
  label: string,
  category: DerivedStatCategory,
  displayOrder: number,
  opts: {
    baseValue?: number;
    rawStatSource?: RawStatSource;
    primaryCoefficients: Partial<Record<PrimaryStatKey, number>>;
    minValue?: number;
    maxValue?: number;
    description?: string;
  },
): DerivedStatDefinition {
  const masteryImplemented = (MASTERY_IMPLEMENTED_DERIVED_KEYS as readonly string[]).includes(key);
  return {
    key,
    label,
    category,
    baseValue: opts.baseValue ?? 0,
    rawStatSource: opts.rawStatSource ?? null,
    primaryCoefficients: opts.primaryCoefficients,
    minValue: opts.minValue ?? null,
    maxValue: opts.maxValue ?? null,
    displayOrder,
    enabled: true,
    // Métadonnées Studio (V3-A/B). Les 10 dérivées consommées par un hook sont
    // exposées comme Mastery Effect targets (implemented + les 2 modes) ; les
    // autres restent calculatedOnly. Éditables ensuite depuis le Studio.
    masteryEligible: masteryImplemented,
    allowedModifierModes: masteryImplemented ? ['percentPerLevel', 'flatPerLevel'] : [],
    runtimeStatus: masteryImplemented ? 'implemented' : 'calculatedOnly',
    description: opts.description ?? null,
  } as DerivedStatDefinition;
}

/**
 * Clés des dérivées SYSTÈME (V3 maintenance) : celles seedées par le code
 * (`DEFAULT_DERIVED_STAT_DEFINITIONS`). Non supprimables depuis le Studio —
 * elles sont référencées par le calculateur et le contrat `stats.derived`.
 * Toute clé absente de cet ensemble est une stat CUSTOM (créée dans le Studio),
 * supprimable si aucune référence.
 */
export const SYSTEM_DERIVED_STAT_KEYS: ReadonlySet<string> = new Set(
  DEFAULT_DERIVED_STAT_DEFINITIONS.map((d) => d.key),
);

export function isSystemDerivedStat(key: string): boolean {
  return SYSTEM_DERIVED_STAT_KEYS.has(key);
}
