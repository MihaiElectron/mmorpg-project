// apps/api-gateway/src/player-runtime/player-runtime.types.ts

/**
 * Stats directement issues de Character (avant tout calcul dérivé).
 * Source unique : la DB. Jamais inventées ni extrapolées côté runtime.
 */
export interface BaseStats {
  level: number;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  experience: number;
}

/**
 * Clés des stats qui peuvent être ciblées par un RuntimeModifier.
 * Toute nouvelle stat dérivée doit être ajoutée ici pour devenir modifiable.
 */
export type StatKey =
  | 'maxHp'
  | 'attackPower'
  | 'defenseTotal'
  | 'speed'
  | 'gatheringRange'
  | 'attackRange';

/**
 * Opération appliquée par un modifier :
 * - flat          : addition directe (ex. +20 HP)
 * - percent_add   : bonus additif en % (ex. +10% — tous les percent_add sont
 *                   sommés avant d'être appliqués une seule fois)
 * - percent_multiply : multiplicateur indépendant (ex. ×1.15 — chaque
 *                   percent_multiply est appliqué séquentiellement)
 * - override      : remplace la valeur calculée avant caps et arrondi (Lot 1,
 *                   consommé uniquement par `RuntimeComputeEngine.resolveStat`).
 *
 * Convention `value` :
 * - flat            : delta absolu (ex. `20` = +20, `-10` = −10) ;
 * - percent_add     : points de pourcentage (ex. `20` = +20 %, `-10` = −10 %) ;
 * - percent_multiply: points de pourcentage AUTOUR de l'élément neutre 0
 *                     (ex. `50` = ×1.5, `-20` = ×0.8, `0` = ×1.0) ;
 * - override        : valeur finale imposée avant caps/arrondi.
 *
 * Ordre d'application : flat → percent_add → percent_multiply → override.
 *
 * Compatibilité : `compute`/`computeWithTrace` (multi-stat, historique) ne
 * traitent QUE flat/percent_add/percent_multiply. Un modifier `override` y est
 * ignoré silencieusement (jamais sélectionné) ; il n'est consommé que par le
 * resolver mono-stat `resolveStat` (Lot 1).
 */
export type ModifierOperation =
  | 'flat'
  | 'percent_add'
  | 'percent_multiply'
  | 'override';

/**
 * Origine d'un RuntimeModifier.
 * Le calculator ne connaît aucune de ces sources en détail —
 * il reçoit une liste de modifiers opaques et les applique.
 */
export type ModifierSourceType =
  | 'equipment'
  | 'buff'
  | 'debuff'
  | 'talent'
  | 'passive_skill'
  | 'aura'
  | 'mount'
  | 'consumable'
  | 'event'
  | 'base'
  | 'debug';

/**
 * Modifier générique et data-driven.
 *
 * Règles de conception :
 * - Aucun code ne doit connaître "Sword", "Helmet", "Rage Buff", etc.
 *   La source est identifiée par sourceType + sourceId + sourceLabel.
 * - Un modifier désactivé (enabled: false) est ignoré silencieusement.
 * - priority : ordre d'application à l'intérieur d'une même opération
 *   (plus petit = appliqué en premier).
 * - reason : documentation libre, sans impact sur le calcul.
 */
export interface RuntimeModifier {
  id: string;
  sourceType: ModifierSourceType;
  sourceId: string;
  sourceLabel: string;
  targetStat: StatKey;
  operation: ModifierOperation;
  value: number;
  priority: number;
  enabled: boolean;
  reason?: string;
  /**
   * Étiquettes normalisées (Lot 1) — lues UNIQUEMENT par l'étage de filtres du
   * resolver `resolveStat`. Optionnel et rétrocompatible : les modifiers
   * existants (sans `tags`) se comportent comme si `tags = []`. N'a aucun effet
   * sur `compute`/`computeWithTrace`.
   */
  tags?: string[];
}

/**
 * Stats calculées depuis BaseStats + RuntimeModifier[].
 *
 * Phase actuelle (Phase 3) :
 *   - maxHp / attackPower / defenseTotal / attackRange incluent les bonus d'équipement.
 *   - speed / gatheringRange : documentés, pas encore de valeur dans Character.
 *
 * Prochaine étape : Buffs, Talents, Auras — concaténer leurs RuntimeModifier[]
 * dans PlayerRuntimeService.resolveModifiers().
 */
export interface DerivedStats {
  maxHp: number;
  attackPower: number;
  defenseTotal: number;
  speed: number;
  gatheringRange: number;
  attackRange: number;
}

/**
 * Application d'un modifier dans le cadre d'un calcul tracé.
 * Permet au Studio d'afficher la contribution exacte de chaque modifier.
 */
export interface ModifierApplication {
  modifierId: string;
  sourceType: ModifierSourceType;
  sourceId: string;
  sourceLabel: string;
  operation: ModifierOperation;
  value: number;
  contribution: number;
}

/**
 * Trace d'une stat : valeur de base, liste des modifiers appliqués, valeur finale.
 */
export interface StatTrace {
  stat: StatKey;
  baseValue: number;
  modifiers: ModifierApplication[];
  finalValue: number;
}

/**
 * Trace complète du calcul DerivedStats.
 *
 * Contrat Studio SDK :
 *   Pour chaque stat, le Studio peut afficher :
 *     - son origine (baseValue)
 *     - chaque modifier (sourceLabel, operation, value, contribution)
 *     - sa valeur finale
 *   Sans jamais recalculer quoi que ce soit côté Studio.
 */
export interface RuntimeTrace {
  stats: Partial<Record<StatKey, StatTrace>>;
  modifierCount: number;
  computedAt: Date;
}

/**
 * Représentation vivante d'un personnage connecté.
 *
 * Règles :
 * - Ne jamais écrire en DB depuis cette structure.
 * - Ne remplace pas Character (source de vérité DB).
 * - Position issue de ConnectedPlayer si en ligne, sinon dernière valeur DB.
 */
export interface PlayerRuntime {
  characterId: string;
  name: string;
  worldX: number;
  worldY: number;
  mapId: number;
  baseStats: BaseStats;
  derivedStats: DerivedStats;
  isConnected: boolean;
  socketId: string | null;
}

export interface RuntimeStatsResult {
  base: BaseStats;
  derived: DerivedStats;
}

/**
 * Définition d'un modifier à l'intérieur d'un PlayerRuntimeEffect.
 *
 * Forme intentionnellement plus légère que RuntimeModifier :
 * id, sourceType et sourceLabel sont portés par l'effet parent —
 * effectToModifiers() les propage à chaque RuntimeModifier produit.
 */
export interface EffectModifierDef {
  targetStat: StatKey;
  operation: ModifierOperation;
  value: number;
  priority?: number;
}

/**
 * Effet runtime d'un personnage : buff, debuff, consommable, aura ou événement.
 *
 * Règles :
 * - Ne jamais persister cette structure en DB — elle est construite en mémoire
 *   à partir des sources existantes (futur : buffs actifs, consommables, auras…).
 * - enabled = false : ignoré silencieusement par effectToModifiers().
 * - expiresAt passé : ignoré silencieusement (vérifié à l'appel, pas en timer).
 * - startsAt : documenté pour le futur. Non appliqué en Phase 4 — un effet
 *   non encore démarré reste de toute façon absent de resolveEffects().
 * - reason : texte libre, propagé à chaque RuntimeModifier produit.
 *
 * Contrat Studio SDK :
 *   Le Studio peut afficher pour chaque effet :
 *     - son origine (sourceType, sourceLabel)
 *     - sa durée (startsAt, expiresAt)
 *     - son état (enabled)
 *     - ses modifiers détaillés dans la RuntimeTrace
 */
export interface PlayerRuntimeEffect {
  id: string;
  sourceType: Extract<ModifierSourceType, 'buff' | 'debuff' | 'consumable' | 'aura' | 'event'>;
  sourceId: string;
  sourceLabel: string;
  modifiers: EffectModifierDef[];
  enabled: boolean;
  startsAt?: Date;
  expiresAt?: Date;
  reason?: string;
}

// ─── Resolver mono-stat (Lot 1 — ADR-0021) ────────────────────────────────────
//
// Types du pipeline pur de résolution d'UNE statistique, consommé par
// `RuntimeComputeEngine.resolveStat`. Le resolver ne connaît AUCUNE formule
// métier : il reçoit une valeur de base + des contributions déjà collectées.
// Aucune dépendance NestJS / TypeORM / réseau. Déterministe.

/**
 * Politique d'arrondi FINAL d'une statistique (appliquée une seule fois, après
 * les caps). `none` conserve les décimales (défaut). Aucun arrondi intermédiaire.
 */
export type RoundingPolicy = 'none' | 'floor' | 'round' | 'ceil';

/** Bornes optionnelles appliquées APRÈS l'override et AVANT l'arrondi. */
export interface StatCaps {
  /** Borne minimale incluse. Absente = pas de plancher. */
  min?: number;
  /** Borne maximale incluse. Absente = pas de plafond. `min > max` = erreur. */
  max?: number;
}

/**
 * Signe EFFECTIF d'une contribution, dérivé de son effet réel (pas seulement du
 * signe brut de `value`) :
 * - flat / percent_add / percent_multiply : `positive` si value > 0,
 *   `negative` si value < 0, `neutral` si value === 0 (pour percent_multiply,
 *   value 0 = ×1.0 = neutre ; value 50 = ×1.5 = positive ; -20 = ×0.8 = negative) ;
 * - override : toujours `neutral` (remplacement, ni bonus ni malus) — jamais
 *   ciblé par un filtre de signe.
 */
export type ContributionSign = 'positive' | 'negative' | 'neutral';

/**
 * Critères de correspondance d'un filtre (combinés en ET). Un critère absent
 * n'est pas testé. `match` vide correspond à toutes les contributions.
 */
export interface StatFilterMatch {
  sourceType?: ModifierSourceType;
  sourceId?: string;
  /** Correspond si la contribution porte ce tag. */
  tag?: string;
  /** Correspond selon le signe EFFECTIF (jamais un override, toujours neutre). */
  sign?: Extract<ContributionSign, 'positive' | 'negative'>;
}

/**
 * Filtre / neutralisation appliqué AVANT le calcul, sur les contributions
 * (jamais sur la valeur finale). `scale` réduit l'écart de la contribution à son
 * élément neutre :
 * - `0`   : contribution exclue ;
 * - `0<scale<1` : réduction partielle (ex. +20 → +10 ; ×1.2 → ×1.1) ;
 * - `1`   : sans effet.
 * `scale` doit être fini et ≥ 0 (sinon erreur `INVALID_FILTER_SCALE`).
 * Pour un `override`, seul `scale === 0` a un sens (exclusion) ; un `scale > 0`
 * laisse l'override inchangé (pas de neutre pour un remplacement).
 * Plusieurs filtres correspondants : leurs `scale` sont MULTIPLIÉS (commutatif),
 * exclusion totale dès qu'un `scale === 0`.
 */
export interface StatContributionFilter {
  /** Identifiant facultatif du filtre (trace). */
  id?: string;
  /** Raison lisible, propagée à la trace des contributions filtrées. */
  reason?: string;
  match: StatFilterMatch;
  scale: number;
}

/** Entrée du resolver mono-stat. */
export interface StatResolutionInput {
  /** Clé de la stat (étiquetage de trace ; filtre `targetStat === stat`). */
  stat: StatKey;
  /** Valeur de base (déjà collectée : base + contributions dérivées incluses). */
  baseValue: number;
  /** Contributions déjà collectées pour cette stat (domaine agnostique). */
  contributions: RuntimeModifier[];
  /** Filtres/neutralisations optionnels (défaut : aucun). */
  filters?: StatContributionFilter[];
  /** Caps optionnels (défaut : aucun). */
  caps?: StatCaps;
  /** Politique d'arrondi final (défaut : `none`). */
  rounding?: RoundingPolicy;
}

/** Contribution retenue (post-filtre) et sa participation exacte à la stat. */
export interface AppliedContribution {
  modifierId: string;
  sourceType: ModifierSourceType;
  sourceId: string;
  operation: ModifierOperation;
  /** `value` d'origine du modifier. */
  originalValue: number;
  /** `value` après application du facteur de filtre combiné. */
  effectiveValue: number;
  /** Facteur de filtre combiné appliqué (1 = aucun filtre). */
  scale: number;
  /** Delta EXACT (non arrondi) apporté à la stat par cette contribution. */
  contribution: number;
  tags: string[];
}

/** Contribution filtrée (exclue ou partiellement réduite). */
export interface FilteredContribution {
  modifierId: string;
  sourceType: ModifierSourceType;
  sourceId: string;
  operation: ModifierOperation;
  originalValue: number;
  /** Facteur combiné (0 = exclue). */
  scale: number;
  /** true si la contribution est totalement exclue (`scale === 0`). */
  excluded: boolean;
  /** Raisons issues des filtres correspondants. */
  reasons: string[];
}

/**
 * Résultat + trace enrichie de la résolution d'UNE statistique. Sert
 * directement l'explication Studio (valeurs intermédiaires, filtrés, override,
 * caps, arrondi) — sans logique de résolution côté client.
 */
export interface StatResolutionResult {
  stat: StatKey;
  baseValue: number;
  /** Contributions `enabled` visant cette stat, AVANT filtrage. */
  received: RuntimeModifier[];
  /** Contributions retenues (post-filtre) avec leur delta exact. */
  applied: AppliedContribution[];
  /** Contributions filtrées (exclues ou réduites) avec raison. */
  filtered: FilteredContribution[];
  /** Valeur après les contributions plates. */
  afterFlat: number;
  /** Valeur après les pourcentages additifs (sommés puis appliqués une fois). */
  afterPercentAdd: number;
  /** Valeur après les multiplicateurs (appliqués séquentiellement). */
  afterPercentMultiply: number;
  /** Valeur après l'override retenu (identique à afterPercentMultiply si aucun). */
  afterOverride: number;
  /** Valeur avant caps (= afterOverride). */
  beforeCaps: number;
  /** Valeur après caps (avant arrondi). */
  afterCaps: number;
  /** Valeur finale autoritaire (après arrondi). */
  finalValue: number;
  /** Override retenu (priorité la plus élevée), sinon null. */
  overrideApplied: { modifierId: string; priority: number; value: number } | null;
  /** Politique d'arrondi effectivement appliquée. */
  roundingPolicy: RoundingPolicy;
  /** Bornes effectives (null si absentes). */
  caps: { min: number | null; max: number | null };
}

/** Codes d'erreur de CONFIGURATION du resolver (déterministes, traçables). */
export type StatResolutionErrorCode =
  | 'NON_FINITE_VALUE'
  | 'UNKNOWN_OPERATION'
  | 'DUPLICATE_OVERRIDE_PRIORITY'
  | 'INVALID_CAPS'
  | 'INVALID_FILTER_SCALE'
  | 'INVALID_PRIORITY';

/**
 * Erreur de configuration du resolver mono-stat. Classe typée PURE (n'étend
 * aucune exception NestJS). Portée par un `code` machine + un message lisible.
 */
export class StatResolutionError extends Error {
  readonly code: StatResolutionErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: StatResolutionErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'StatResolutionError';
    this.code = code;
    this.details = details;
    // Chaîne de prototype correcte pour `instanceof` après compilation TS.
    Object.setPrototypeOf(this, StatResolutionError.prototype);
  }
}
