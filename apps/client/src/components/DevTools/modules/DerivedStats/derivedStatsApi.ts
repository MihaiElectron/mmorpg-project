import type {
  CreateDerivedStatPayload,
  DerivedStatFullDto,
  DerivedStatReferencesReport,
  RemoveMasteryReferencePayload,
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

/**
 * Références d'une stat dérivée + éligibilité à la suppression (V3 maintenance).
 * Le serveur reste la seule autorité (isSystem / canDelete calculés serveur).
 */
export async function fetchDerivedStatReferences(
  key: string,
): Promise<DerivedStatReferencesReport> {
  const res = await fetch(
    `${API}/admin/derived-stat-definitions/${encodeURIComponent(key)}/references`,
    { headers: authHeaders() },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<DerivedStatReferencesReport>;
}

/**
 * Supprime une stat dérivée CUSTOM (V3 maintenance). Le serveur refuse les
 * stats système et celles encore référencées par un effet de maîtrise.
 */
export async function deleteDerivedStatDefinition(
  key: string,
): Promise<{ deleted: boolean; key: string }> {
  const res = await fetch(
    `${API}/admin/derived-stat-definitions/${encodeURIComponent(key)}`,
    { method: "DELETE", headers: authHeaders() },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ deleted: boolean; key: string }>;
}

/**
 * Retire un modifier d'effet de maîtrise ciblant cette stat (V3 maintenance).
 * L'appelant recharge ensuite le rapport de références (les index se décalent).
 */
export async function removeDerivedStatMasteryReference(
  key: string,
  payload: RemoveMasteryReferencePayload,
): Promise<void> {
  const res = await fetch(
    `${API}/admin/derived-stat-definitions/${encodeURIComponent(key)}/remove-mastery-reference`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
}

/** Crée une stat dérivée. La key est immuable après création (voir duplication). */
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
