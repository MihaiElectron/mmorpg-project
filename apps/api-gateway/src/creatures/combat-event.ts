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
