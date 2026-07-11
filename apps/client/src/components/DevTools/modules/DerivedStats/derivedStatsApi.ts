import type {
  CreateDerivedStatPayload,
  DerivedStatFullDto,
  UpdateDerivedStatPayload,
} from "./derivedStats.types";

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

/** Toutes les stats dérivées (config complète V3-A). */
export async function fetchDerivedStats(): Promise<DerivedStatFullDto[]> {
  const res = await fetch(`${API}/admin/derived-stat-definitions`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<DerivedStatFullDto[]>;
}

/** Crée une stat dérivée (key immuable ensuite — pas de DELETE, enabled=false). */
export async function createDerivedStat(
  payload: CreateDerivedStatPayload,
): Promise<DerivedStatFullDto> {
  const res = await fetch(`${API}/admin/derived-stat-definitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<DerivedStatFullDto>;
}

/** Patch partiel d'une stat dérivée. Le serveur valide et recalcule. */
export async function updateDerivedStat(
  key: string,
  patch: UpdateDerivedStatPayload,
): Promise<DerivedStatFullDto> {
  const res = await fetch(`${API}/admin/derived-stat-definitions/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<DerivedStatFullDto>;
}
