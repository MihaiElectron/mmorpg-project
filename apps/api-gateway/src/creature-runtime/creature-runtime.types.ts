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
