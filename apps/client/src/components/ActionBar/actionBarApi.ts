// Client de la barre d'action persistante (Skills V1-I). Le serveur reste
// autoritaire : le client lit les 8 slots et propose équiper/vider ; toute la
// validation (kind/enabled/unlock/prérequis) et le cast sont côté serveur.

export type ActionBarUnavailableReason =
  | "empty"
  | "disabled"
  | "non_active"
  | "locked"
  | "level_required"
  | "mastery_required"
  | "unsupported_resource"
  | "unsupported_target"
  | "unknown";

export interface ActionBarSlot {
  slotIndex: number;
  skillKey: string | null;
  name: string | null;
  iconAssetPath: string | null;
  skillKind: "active" | "passive" | "aura" | null;
  enabled: boolean | null;
  available: boolean;
  unavailableReason: ActionBarUnavailableReason | null;
}

const API = import.meta.env.VITE_API_URL as string;

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return typeof body.message === "string" ? body.message : `Erreur ${res.status}`;
}

/** Les 8 slots persistés du personnage connecté (dérivé du JWT serveur). */
export async function fetchActionBar(): Promise<ActionBarSlot[]> {
  const res = await fetch(`${API}/characters/me/action-bar`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { slots: ActionBarSlot[] };
  return data.slots ?? [];
}

/** Équipe (`skillKey`) ou vide (`null`) un slot. Renvoie les 8 slots résolus. */
export async function setActionBarSlot(
  slotIndex: number,
  skillKey: string | null,
): Promise<ActionBarSlot[]> {
  const res = await fetch(`${API}/characters/me/action-bar/slots/${slotIndex}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ skillKey }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { slots: ActionBarSlot[] };
  return data.slots ?? [];
}
