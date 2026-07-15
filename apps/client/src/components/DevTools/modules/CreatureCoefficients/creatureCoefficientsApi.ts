import type { CreatureSecondaryCoefficients } from "./creatureCoefficients.types";

const API = import.meta.env.VITE_API_URL as string;

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return typeof body.message === "string" ? body.message : `Erreur ${res.status}`;
}

/** GET /admin/creatures/secondary-coefficients — config effective serveur. */
export async function fetchCreatureSecondaryCoefficients(): Promise<CreatureSecondaryCoefficients> {
  const res = await fetch(`${API}/admin/creatures/secondary-coefficients`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CreatureSecondaryCoefficients>;
}

/**
 * PATCH /admin/creatures/secondary-coefficients — patch partiel. Renvoie la
 * config effective après application (le serveur valide/borne et reste
 * autoritaire).
 */
export async function updateCreatureSecondaryCoefficients(
  patch: Partial<CreatureSecondaryCoefficients>,
): Promise<CreatureSecondaryCoefficients> {
  const res = await fetch(`${API}/admin/creatures/secondary-coefficients`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CreatureSecondaryCoefficients>;
}
