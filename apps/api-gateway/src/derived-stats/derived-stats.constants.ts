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
  // V4-A : premier hook offensif — ignore un % de l'armure de la cible.
  'armorPenetrationPercent',
  // V4-D : critique branché au combat (bloc attaque). criticalChance = % de
  // chance, criticalDamage = multiplicateur total en % (150 = ×1.5).
  'criticalChance',
  'criticalDamage',
  // V4-F : esquive du défenseur (hit avoidance, avant le bloc attaque).
  'dodgeChance',
  // V4-G : précision de l'attaquant — réduit l'esquive effective du défenseur.
  'accuracy',
  // V4-H : blocage du défenseur (après esquive/critique/armure, physical seul).
  'blockChance',
  'blockReductionPercent',
  // V4-I : parade du défenseur (réaction active, avant esquive) + puissance de
  // la contre-attaque déclenchée par une parade réussie.
  'parryChance',
  'counterAttackPower',
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
  // V4-A : pénétration d'armure en POURCENTAGE (stat système offensive, hook
  // combat). Ignore un % de l'armure de la cible pour les dégâts physiques.
  // baseValue 0, borné 0–100. flatPerLevel = +X points de % par niveau.
  def('armorPenetrationPercent', "Pénétration d'armure", 'offensive', 25, {
    minValue: 0,
    maxValue: 100,
    primaryCoefficients: {},
    description:
      "Ignore un pourcentage de l'armure de la cible lors des dégâts physiques.",
  }),
  def('criticalChance', 'Chance critique', 'offensive', 11, {
    primaryCoefficients: { dexterity: 0.3, agility: 0.2 },
    maxValue: 50,
  }),
  def('criticalDamage', 'Dégâts critiques', 'offensive', 12, {
    baseValue: 150,
    primaryCoefficients: { dexterity: 1 },
  }),
  // V4-I : puissance offensive utilisée par les contre-attaques déclenchées par
  // une parade réussie. Scale dextérité/agilité/intelligence ; configurable via
  // le Studio et ciblable par les maîtrises. baseValue 0, non bornée en haut.
  def('counterAttackPower', 'Puissance de contre-attaque', 'offensive', 27, {
    minValue: 0,
    primaryCoefficients: { dexterity: 0.4, agility: 0.3, intelligence: 0.2 },
    description:
      'Puissance offensive utilisée par les contre-attaques déclenchées par une parade.',
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
  // V4-H : pourcentage des dégâts (post-armure) réduits QUAND un blocage réussit.
  // baseValue 25 → un blocage réussi absorbe 25 % par défaut. Borné 0–100, sans
  // coefficient primaire (vient de l'équipement/maîtrises).
  def('blockReductionPercent', 'Réduction de blocage', 'defensive', 26, {
    baseValue: 25,
    minValue: 0,
    maxValue: 100,
    primaryCoefficients: {},
    description:
      'Pourcentage des dégâts restants absorbés lorsqu\'un blocage réussit (physique).',
  }),

  // ── Résistances magiques par école + globale (ADR-0022 — fondation) ───────
  // Famille canonique UNIQUE `magicResistance*` (les anciennes `magicalResistance*`
  // ont été renommées ici — plus aucune famille concurrente). Points de
  // POURCENTAGE, baseValue 0, AUCUN clamp (min/max null — négatifs et > 100
  // autorisés ; une résistance ≥ 100 n'est PAS une immunité). `calculatedOnly` :
  // résolues et traçables, contribuables par le pipeline générique (coefficients
  // + équipement/modifiers), mais NON consommées par le combat (mitigation =
  // Planned). `fire/water/air/earth` CONSERVENT les coefficients Esprit hérités
  // des anciennes définitions (aucune valeur perdue) ; `global/sacred/poison`
  // sont nouvelles (baseValue 0, sans coefficient).
  def('magicResistanceGlobal', 'Résistance magique globale', 'elemental_resistance', 28, {
    primaryCoefficients: {},
    description:
      "Contribution commune ajoutée à la résistance effective de CHAQUE école (pas une seconde mitigation).",
  }),
  def('magicResistanceFire', 'Résistance feu', 'elemental_resistance', 29, {
    primaryCoefficients: { spirit: 0.5, wisdom: 0.2 },
  }),
  def('magicResistanceWater', 'Résistance eau', 'elemental_resistance', 30, {
    primaryCoefficients: { spirit: 0.5, intelligence: 0.2 },
  }),
  def('magicResistanceAir', 'Résistance air', 'elemental_resistance', 31, {
    primaryCoefficients: { spirit: 0.5, agility: 0.2 },
  }),
  def('magicResistanceEarth', 'Résistance terre', 'elemental_resistance', 32, {
    primaryCoefficients: { spirit: 0.5, endurance: 0.2 },
  }),
  def('magicResistanceSacred', 'Résistance sacrée', 'elemental_resistance', 33, {
    primaryCoefficients: {},
  }),
  def('magicResistancePoison', 'Résistance poison', 'elemental_resistance', 34, {
    primaryCoefficients: {},
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
