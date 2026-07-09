import type {
  DerivedStatDefinitionDto,
  UpdateDerivedStatDefinitionPayload,
  PreviewDerivedStatsPayload,
} from "./derivedStats.types";

const API = import.meta.env.VITE_API_URL as string;

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return typeof body.message === "string" ? body.message : `Erreur ${res.status}`;
}

export async function fetchDerivedStatDefinitions(): Promise<DerivedStatDefinitionDto[]> {
  const res = await fetch(`${API}/admin/derived-stat-definitions`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<DerivedStatDefinitionDto[]>;
}

export async function updateDerivedStatDefinition(
  key: string,
  patch: UpdateDerivedStatDefinitionPayload,
): Promise<DerivedStatDefinitionDto> {
  const res = await fetch(`${API}/admin/derived-stat-definitions/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<DerivedStatDefinitionDto>;
}

export async function previewDerivedStats(
  payload: PreviewDerivedStatsPayload,
): Promise<Record<string, number>> {
  const res = await fetch(`${API}/admin/derived-stat-definitions/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<Record<string, number>>;
}
