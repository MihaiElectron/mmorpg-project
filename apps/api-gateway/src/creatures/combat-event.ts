import { randomUUID } from 'crypto';

/**
 * Combat Event V1 — payload normalisé room-scoped (préparation feedback combat).
 * ---------------------------------------------------------------------------
 * Émis à la room map pour alimenter (côté client, plus tard) dégâts flottants,
 * Combat Log et monitoring. Ne contient PAS de détail de formule (le debug sera
 * un canal séparé). Aucun ancien event n'est remplacé : ceci s'ajoute en parallèle.
 */

export type CombatEventType = 'damage' | 'death';
export type CombatActorType = 'player' | 'creature';

export interface CombatEvent {
  id: string;
  type: CombatEventType;
  amount?: number;
  sourceType: CombatActorType;
  sourceId?: string;
  targetType: CombatActorType;
  targetId: string;
  worldX: number;
  worldY: number;
  text?: string;
  /** Nom du skill à l'origine des dégâts (absent pour une auto-attaque). */
  skillName?: string;
  /** V4-E : true si le hit est un coup critique (info serveur, feedback client). */
  isCritical?: boolean;
  /** V4-E : nom lisible de la cible (ex. "Turkey") pour le message de combat. */
  targetName?: string;
  /** V4-E : true si ce hit a tué la cible (message de mort lié au dernier hit). */
  targetDied?: boolean;
  /** V4-F : true si le défenseur a esquivé le hit (0 dégât). */
  isDodged?: boolean;
  /** V4-H : true si le défenseur a bloqué le hit (dégâts réduits, physique). */
  isBlocked?: boolean;
  /** V4-H : montant absorbé par le blocage (0 si non bloqué). */
  blockedDamage?: number;
  createdAt: number;
}

export interface CombatEventInput {
  type: CombatEventType;
  amount?: number;
  sourceType: CombatActorType;
  sourceId?: string;
  targetType: CombatActorType;
  targetId: string;
  worldX: number;
  worldY: number;
  text?: string;
  skillName?: string;
  isCritical?: boolean;
  targetName?: string;
  targetDied?: boolean;
  isDodged?: boolean;
  isBlocked?: boolean;
  blockedDamage?: number;
}

/** Construit un CombatEvent en remplissant `id` (unique) et `createdAt`. */
export function makeCombatEvent(input: CombatEventInput): CombatEvent {
  return {
    ...input,
    id: randomUUID(),
    createdAt: Date.now(),
  };
}

/** Nom canonique de l'event Socket.IO. */
export const COMBAT_EVENT = 'combat:event';
