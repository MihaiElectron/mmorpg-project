/**
 * Payload WebSocket `skill:cast` (Skills V1-D).
 *
 * Le client envoie une INTENTION uniquement : quel skill, quelle cible. Aucune
 * donnée de gameplay (dégâts, position, portée, cooldown, stats) n'est acceptée
 * du client — tout est lu/calculé serveur.
 *
 * Validation manuelle (pattern WS du projet : les gateways valident le payload
 * à la main, cf. `CreaturesGateway.onAttackCreature`). Le type-guard rejette
 * tout champ inconnu et tout type invalide.
 */

export interface SkillCastPayload {
  skillKey: string;
  targetType: 'creature';
  targetId: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_KEYS = new Set(['skillKey', 'targetType', 'targetId']);

/**
 * Valide et normalise le payload. Retourne le payload typé si valide, sinon
 * `null` (le gateway ignore / répond une erreur au seul lanceur).
 * V1-D : `targetType` doit valoir exactement `"creature"`.
 */
export function parseSkillCastPayload(raw: unknown): SkillCastPayload | null {
  if (typeof raw !== 'object' || raw === null) return null;

  // Rejet des champs inconnus.
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_KEYS.has(key)) return null;
  }

  const { skillKey, targetType, targetId } = raw as Record<string, unknown>;

  if (typeof skillKey !== 'string' || skillKey.trim() === '') return null;
  if (targetType !== 'creature') return null;
  if (typeof targetId !== 'string' || !UUID_PATTERN.test(targetId)) return null;

  return { skillKey, targetType, targetId };
}
