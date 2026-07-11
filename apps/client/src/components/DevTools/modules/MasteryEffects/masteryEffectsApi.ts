import type {
  CreateMasteryDefinitionPayload,
  MasteryDefinitionDto,
  MasteryEffects,
  MasteryEffectTargetsResponse,
} from "./masteryEffects.types";

const API = import.meta.env.VITE_API_URL as string;

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.message === "string") return body.message;
  if (Array.isArray(body.message)) return body.message.join(" — ");
  return `Erreur ${res.status}`;
}

/**
 * Catalogue serveur des stats ciblables, modes et bornes (V2-E) —
 * GET /admin/mastery-effect-targets. Source de vérité de l'UI (pas de liste
 * locale, pas de fallback).
 */
export async function fetchMasteryEffectTargets(): Promise<MasteryEffectTargetsResponse> {
  const res = await fetch(`${API}/admin/mastery-effect-targets`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<MasteryEffectTargetsResponse>;
}

/** Toutes les définitions de maîtrises (avec leurs `effects`). */
export async function fetchMasteryDefinitions(): Promise<MasteryDefinitionDto[]> {
  const res = await fetch(`${API}/admin/mastery-definitions`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<MasteryDefinitionDto[]>;
}

/**
 * Crée une définition de maîtrise (`effects: {}` par défaut — configurés
 * ensuite via PATCH). 409 si la key existe déjà, 400 si payload invalide.
 */
export async function createMasteryDefinition(
  payload: CreateMasteryDefinitionPayload,
): Promise<MasteryDefinitionDto> {
  const res = await fetch(`${API}/admin/mastery-definitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<MasteryDefinitionDto>;
}

/**
 * PATCH des seuls `effects` d'une maîtrise. Le serveur (sanitize) reste le
 * validateur final — toute structure non whitelistée est rejetée en 400.
 */
export async function updateMasteryEffects(
  key: string,
  effects: MasteryEffects,
): Promise<MasteryDefinitionDto> {
  const res = await fetch(`${API}/admin/mastery-definitions/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ effects }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<MasteryDefinitionDto>;
}
