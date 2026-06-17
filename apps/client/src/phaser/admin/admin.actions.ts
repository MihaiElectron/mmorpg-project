const API = import.meta.env.VITE_API_URL as string;
const ACK_TIMEOUT_MS = 5000;

export type ActionResult = {
  success: boolean;
  message: string;
  data?: unknown;
};

function ackPromise(
  socket: any,
  event: string,
  payload: unknown,
): Promise<ActionResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ success: false, message: "Timeout : pas de réponse du serveur." });
    }, ACK_TIMEOUT_MS);

    socket.emit(event, payload, (res: ActionResult) => {
      clearTimeout(timer);
      resolve(res ?? { success: false, message: "Réponse vide du serveur." });
    });
  });
}

/** Crée un spawn de créature à la position donnée. */
export function spawnCreature(
  templateKey: string,
  x: number,
  y: number,
  socket: any,
): Promise<ActionResult> {
  return ackPromise(socket, "admin:spawn", { templateKey, x, y });
}

/** Téléporte un personnage connecté. */
export function teleportCharacter(
  characterId: string,
  x: number,
  y: number,
  socket: any,
): Promise<ActionResult> {
  return ackPromise(socket, "admin:teleport", { characterId, x, y });
}

/** Met à jour les stats d'un template via WS (broadcast category:updated). */
export function updateTemplate(
  key: string,
  fields: Record<string, number>,
  socket: any,
): Promise<ActionResult> {
  return ackPromise(socket, "admin:update_template", { key, fields });
}

/** Met à jour un template via HTTP PATCH (alternatif REST). */
export async function updateTemplateHttp(
  key: string,
  fields: Record<string, number>,
  token: string,
): Promise<ActionResult> {
  try {
    const res = await fetch(`${API}/admin/templates/${key}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        success: false,
        message: `Erreur ${res.status} : ${(err as any).message ?? "inconnue"}.`,
      };
    }
    const updated = await res.json();
    return {
      success: true,
      message: `Template "${(updated as any).name}" mis à jour.`,
      data: updated,
    };
  } catch (e) {
    return { success: false, message: `Erreur réseau : ${String(e)}` };
  }
}
