// Client des skills actifs joueur (V1-E). Lecture seule : le client affiche,
// le serveur reste autoritaire. Aucune route /admin.

export interface PlayerActiveSkill {
  key: string;
  name: string;
  description: string;
  iconAssetPath: string | null;
  cooldownMs: number;
  rangeWU: number;
  targetMode: "self" | "creature";
  effectType: "damage" | "heal";
  resourceType: "health" | "mana" | "energy" | null;
  resourceCost: number;
  executable: boolean;
  disabledReason?: string;
}

const API = import.meta.env.VITE_API_URL as string;

/** Skills actifs utilisables par le personnage connecté (dérivé du JWT serveur). */
export async function fetchMyActiveSkills(): Promise<PlayerActiveSkill[]> {
  const res = await fetch(`${API}/characters/me/active-skills`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(typeof body.message === "string" ? body.message : `Erreur ${res.status}`);
  }
  return res.json() as Promise<PlayerActiveSkill[]>;
}
