import type {
  GameConfigDto,
  GameConfigPreview,
  StatPointsRecalculationReport,
} from "./characterProgression.types";

const API = import.meta.env.VITE_API_URL as string;

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return typeof body.message === "string" ? body.message : `Erreur ${res.status}`;
}

export async function fetchGameConfig(): Promise<GameConfigDto> {
  const res = await fetch(`${API}/admin/game-config`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<GameConfigDto>;
}

export async function previewGameConfig(
  draft: Partial<GameConfigDto>,
  targetLevel?: number,
): Promise<GameConfigPreview> {
  const query =
    targetLevel != null ? `?targetLevel=${encodeURIComponent(targetLevel)}` : "";
  const res = await fetch(`${API}/admin/game-config/preview${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(draft),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<GameConfigPreview>;
}

export async function updateGameConfig(
  draft: Partial<GameConfigDto>,
): Promise<GameConfigDto> {
  const res = await fetch(`${API}/admin/game-config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(draft),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<GameConfigDto>;
}

export async function recalculateCharacterStatPoints(): Promise<StatPointsRecalculationReport> {
  const res = await fetch(
    `${API}/admin/game-config/recalculate-character-stat-points`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ confirm: true }),
    },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<StatPointsRecalculationReport>;
}
