import type {
  CreatureDerivedConfiguration,
  CreatureRuntimeSnapshot,
  ReplaceDerivedConfigurationPayload,
} from "./creatureDerivedConfig.types";

const API = import.meta.env.VITE_API_URL as string;

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`,
    "Content-Type": "application/json",
  };
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return typeof body.message === "string" ? body.message : `Erreur ${res.status}`;
}

/** GET config de dérivation d'un template (par clé). Serveur autoritaire. */
export async function fetchDerivedConfiguration(
  templateKey: string,
  signal?: AbortSignal,
): Promise<CreatureDerivedConfiguration> {
  const res = await fetch(
    `${API}/admin/creatures/templates/${encodeURIComponent(templateKey)}/derived-configuration`,
    { headers: authHeaders(), signal },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CreatureDerivedConfiguration>;
}

/** PUT remplacement complet de la config. Renvoie la config après application. */
export async function saveDerivedConfiguration(
  templateKey: string,
  payload: ReplaceDerivedConfigurationPayload,
): Promise<CreatureDerivedConfiguration> {
  const res = await fetch(
    `${API}/admin/creatures/templates/${encodeURIComponent(templateKey)}/derived-configuration`,
    { method: "PUT", headers: authHeaders(), body: JSON.stringify(payload) },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CreatureDerivedConfiguration>;
}

/** GET snapshot runtime d'une instance (primaires + dérivées + traces). */
export async function fetchRuntimeSnapshot(
  instanceId: string,
  signal?: AbortSignal,
): Promise<CreatureRuntimeSnapshot> {
  const res = await fetch(
    `${API}/admin/creatures/instances/${encodeURIComponent(instanceId)}/runtime-stats`,
    { headers: authHeaders(), signal },
  );
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<CreatureRuntimeSnapshot>;
}
