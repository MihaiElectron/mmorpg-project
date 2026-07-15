// apps/api-gateway/src/creature-runtime/creature-runtime.types.ts
//
// Types propres au Creature Runtime.
// Aucune logique, aucune dépendance injectable, aucun import NestJS.

import type { EntityRuntimeSnapshot } from '../player-runtime/entity-runtime.types';

// ─── Stats de base ────────────────────────────────────────────────────────────

/**
 * Stats brutes d'une créature — issues de la DB (Creature + CreatureTemplate).
 *
 * Source :
 *   baseHealth / baseArmor / baseAttack / speedMin / speedMax → CreatureTemplate
 *   currentHealth                                             → Creature.health (état runtime courant)
 *
 * Règle : jamais calculées ni extrapolées — lecture directe des colonnes DB.
 */
export interface CreatureBaseStats {
  /** PV maximum déclarés dans le template. */
  baseHealth: number;
  /** Armure de base (défense). */
  baseArmor: number;
  /** Attaque de base. */
  baseAttack: number;
  /** PV actuels de l'instance — état runtime, peut différer de baseHealth. */
  currentHealth: number;
  /** Vitesse minimale de patrouille (WU/tick). */
  speedMin: number;
  /** Vitesse maximale de patrouille (WU/tick). */
  speedMax: number;

  // ── Stats de combat avancées (V5-D2-A) ─────────────────────────────────────
  // Valeurs de config lues directement depuis le template. Pas encore
  // modifiables par RuntimeModifier (contrairement à maxHp/attackPower/defense).
  // 0 = comportement V5-B/D1 inchangé.
  /** Puissance de soin brute. 0 → fallback runtime sur attackPower (V5-D1). */
  healingPower: number;
  /** Chance de critique en % (0–100). 0 = jamais de critique. */
  criticalChance: number;
  /** Multiplicateur critique total en % (150 = ×1.5). Pertinent si criticalChance > 0. */
  criticalDamage: number;
  /** Précision en points de % (réduit l'esquive effective de la cible). 0 = aucune. */
  accuracy: number;
  /** Pénétration d'armure en % (0–100), appliquée aux dégâts physiques. 0 = aucune. */
  armorPenetrationPercent: number;

  // ── Stats primaires (V6-B1) ────────────────────────────────────────────────
  // Les 10 primaires alignées sur le joueur. Fondation de données ; leur
  // dérivation vers les secondaires est faite dans le calculateur (V6-B2).
  strength: number;
  vitality: number;
  endurance: number;
  agility: number;
  dexterity: number;
  intelligence: number;
  wisdom: number;
  spirit: number;
  willpower: number;
  charisma: number;
}

// ─── Stats dérivées ───────────────────────────────────────────────────────────

/**
 * Stats calculées pour une créature, après application des RuntimeModifier[].
 *
 * Différences avec DerivedStats (joueur) :
 *   - Pas de gatheringRange — les créatures ne récoltent pas.
 *   - speed dérivée de speedMax — valeur plafond de patrouille.
 *   - attackRange est 0 en Phase 1 — CreatureTemplate n'a pas de champ dédié.
 */
export interface CreatureDerivedStats {
  /** PV maximum après modifiers. */
  maxHp: number;
  /** Puissance d'attaque après modifiers. */
  attackPower: number;
  /** Défense totale après modifiers. */
  defenseTotal: number;
  /** Vitesse maximale après modifiers (WU/tick). */
  speed: number;
  /**
   * Portée d'attaque après modifiers.
   * Phase 1 : 0 — MELEE_RANGE_WU (960) est une constante dans CreaturesService,
   * pas encore exposée dans CreatureTemplate.
   */
  attackRange: number;
}

// ─── Stats de combat effectives (V6-A Lot 2) ──────────────────────────────────

/**
 * Point unique des stats de combat EFFECTIVES d'une créature (lecture seule),
 * assemblées par `CreatureRuntimeCalculator.resolveCombatStats`. Centralise ce
 * qui était recalculé/dupliqué par les consommateurs (inspector, combat) :
 *   - `maxHealth`/`attackPower`/`defenseTotal` : dérivées via RuntimeComputeEngine
 *     (debug modifiers appliqués, comme aujourd'hui) ;
 *   - stats avancées (`criticalChance`/`criticalDamage`/`accuracy`/
 *     `armorPenetrationPercent`) : lues brutes du template (hors RuntimeModifier) ;
 *   - `healingPowerEffective` : fallback centralisé `raw > 0 ? raw : attackPower`.
 *
 * `canDodge` (V6-B3) vaut `dodgeChance > 0` et `canBlock` (V6-B4) vaut
 * `blockChance > 0 && blockReductionPercent > 0` : une créature PEUT désormais
 * esquiver puis bloquer un hit physique entrant (esquive effective
 * `clamp(dodgeChance − accuracy, 0, 100)`, blocage `physical` uniquement après
 * l'armure — géré par le calculateur). `canParry` reste figé à `false` : la
 * parade créature n'est pas encore active — `parryChance` est CALCULÉE (V6-B2)
 * mais NON passée au défenseur (affichage/inspection seul).
 * Ne change AUCUNE formule offensive existante hors activation primaires.
 */
export interface CreatureCombatStats {
  maxHealth: number;
  attackPower: number;
  defenseTotal: number;
  /** Valeur brute du template (0 = non configurée). */
  healingPowerRaw: number;
  /** Valeur appliquée en soin : `healingPowerRaw > 0 ? healingPowerRaw : attackPower`. */
  healingPowerEffective: number;
  criticalChance: number;
  criticalDamage: number;
  accuracy: number;
  armorPenetrationPercent: number;

  // ── Secondaires défensives dérivées (V6-B2) — calculées, NON actives ────────
  // Dérivées des primaires mais jamais passées au défenseur tant que
  // canDodge/canBlock/canParry = false. Exposition/inspection uniquement.
  /** Chance d'esquive dérivée (%), cap 40. Non active (canDodge false). */
  dodgeChance: number;
  /** Chance de blocage dérivée (%), cap 40. Non active (canBlock false). */
  blockChance: number;
  /** Réduction de dégâts d'un blocage réussi (%). Constante actuelle 25. */
  blockReductionPercent: number;
  /** Chance de parade dérivée (%), cap 40. Non active (canParry false). */
  parryChance: number;
  /** Puissance de contre-attaque dérivée. Non active (canParry false). */
  counterAttackPower: number;
  /**
   * PV max dérivé des primaires (`baseHealth + vitality × coeff`). CALCULÉ mais
   * NON activé comme PV max runtime (V6-B2 Lot 1) : `maxHealth` reste `baseHealth`.
   */
  maxHealthDerived: number;

  /** V6-B3 : true si `dodgeChance > 0` — la créature peut esquiver un hit entrant. */
  canDodge: boolean;
  /** V6-B4 : true si `blockChance > 0 && blockReductionPercent > 0` — blocage physique actif. */
  canBlock: boolean;
  readonly canParry: false;
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

/**
 * Snapshot complet du Creature Runtime — implémentation de EntityRuntimeSnapshot.
 *
 * Étend EntityRuntimeSnapshot<CreatureBaseStats, CreatureDerivedStats> avec :
 *   - entityKind: 'creature' fixe
 *   - creatureState : état de la FSM IA au moment du calcul
 *   - templateKey   : clé du template (ex. 'turkey', 'goblin')
 *
 * Règles Studio SDK :
 *   - Lecture seule — le Studio observe, ne recalcule jamais.
 *   - creatureState est un instantané — peut avoir changé depuis le calcul.
 *   - worldX / worldY / mapId issus de EntityRuntimeIdentity (optionnels).
 */
export interface CreatureRuntimeSnapshot
  extends EntityRuntimeSnapshot<CreatureBaseStats, CreatureDerivedStats> {
  readonly entityKind: 'creature';
  /** État de la FSM IA à l'instant du calcul. */
  readonly creatureState: 'alive' | 'fighting' | 'escaping' | 'dead';
  /** Clé du template (ex. 'turkey', 'goblin'). */
  readonly templateKey: string;
}
