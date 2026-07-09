/**
 * Payload WebSocket `skill:cast` (Skills V1-D + V1-G).
 *
 * Le client envoie une INTENTION uniquement : quel skill, quelle cible. Aucune
 * donnée de gameplay (dégâts, soin, position, portée, cooldown, stats) n'est
 * acceptée du client — tout est lu/calculé serveur.
 *
 * Deux formes valides :
 *   - `{ skillKey, targetType: "creature", targetId }` (V1-D, dégâts créature)
 *   - `{ skillKey, targetType: "self" }`               (V1-G, soin sur soi)
 *
 * `targetId` est OBLIGATOIRE pour `creature` et INTERDIT pour `self`.
 *
 * Validation manuelle (pattern WS du projet : les gateways valident le payload
 * à la main, cf. `CreaturesGateway.onAttackCreature`). Le type-guard rejette
 * tout champ inconnu et tout type invalide.
 */

export type SkillCastPayload =
  | { skillKey: string; targetType: 'creature'; targetId: string }
  | { skillKey: string; targetType: 'self' };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Valide et normalise le payload. Retourne le payload typé si valide, sinon
 * `null` (le gateway ignore / répond une erreur au seul lanceur).
 */
export function parseSkillCastPayload(raw: unknown): SkillCastPayload | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const record = raw as Record<string, unknown>;
  const { skillKey, targetType, targetId } = record;

  if (typeof skillKey !== 'string' || skillKey.trim() === '') return null;

  if (targetType === 'creature') {
    // Champs autorisés stricts : skillKey, targetType, targetId.
    for (const key of Object.keys(record)) {
      if (key !== 'skillKey' && key !== 'targetType' && key !== 'targetId') return null;
    }
    if (typeof targetId !== 'string' || !UUID_PATTERN.test(targetId)) return null;
    return { skillKey, targetType: 'creature', targetId };
  }

  if (targetType === 'self') {
    // `targetId` interdit pour self ; aucun autre champ inconnu autorisé.
    for (const key of Object.keys(record)) {
      if (key !== 'skillKey' && key !== 'targetType') return null;
    }
    return { skillKey, targetType: 'self' };
  }

  return null;
}
