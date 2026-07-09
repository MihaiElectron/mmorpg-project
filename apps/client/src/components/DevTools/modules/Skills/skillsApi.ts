import type {
  SkillDefinitionDto,
  CreateSkillDefinitionPayload,
  UpdateSkillDefinitionPayload,
  KeySuggestion,
} from "./skills.types";

const API = import.meta.env.VITE_API_URL as string;

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return typeof body.message === "string" ? body.message : `Erreur ${res.status}`;
}

export async function fetchSkillDefinitions(): Promise<SkillDefinitionDto[]> {
  const res = await fetch(`${API}/admin/skill-definitions`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SkillDefinitionDto[]>;
}

export async function createSkillDefinition(
  payload: CreateSkillDefinitionPayload,
): Promise<SkillDefinitionDto> {
  const res = await fetch(`${API}/admin/skill-definitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SkillDefinitionDto>;
}

export async function updateSkillDefinition(
  key: string,
  payload: UpdateSkillDefinitionPayload,
): Promise<SkillDefinitionDto> {
  const res = await fetch(`${API}/admin/skill-definitions/${encodeURIComponent(key)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<SkillDefinitionDto>;
}

export async function deleteSkillDefinition(key: string): Promise<void> {
  const res = await fetch(`${API}/admin/skill-definitions/${encodeURIComponent(key)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

// ── Catalogues lecture seule pour l'autocomplétion (ne modifient rien) ─────────

/** Masteries existantes → suggestions pour requiredMasteries et masteryCoefficients. */
export async function fetchMasterySuggestions(): Promise<KeySuggestion[]> {
  const res = await fetch(`${API}/admin/mastery-definitions`, { headers: authHeaders() });
  if (!res.ok) return [];
  const rows = (await res.json().catch(() => [])) as Array<{ key: string; name?: string }>;
  return rows.map((r) => ({ key: r.key, label: r.name ? `${r.name} (${r.key})` : r.key }));
}

/** Dérivées existantes → suggestions pour scaling.derivedCoefficients. */
export async function fetchDerivedStatSuggestions(): Promise<KeySuggestion[]> {
  const res = await fetch(`${API}/admin/derived-stat-definitions`, { headers: authHeaders() });
  if (!res.ok) return [];
  const rows = (await res.json().catch(() => [])) as Array<{ key: string; label?: string }>;
  return rows.map((r) => ({ key: r.key, label: r.label ? `${r.label} (${r.key})` : r.key }));
}
