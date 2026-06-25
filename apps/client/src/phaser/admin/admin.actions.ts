const API = import.meta.env.VITE_API_URL as string;
const ACK_TIMEOUT_MS = 5000;

export type ActionResult = {
  success: boolean;
  message: string;
  data?: unknown;
};

export type MovementMetrics = {
  totalMoves: number;
  suspectTeleports: number;
  suspectSpeed: number;
  invalidCoordinates: number;
  mapMismatch: number;
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

/** Crée un spawn de créature à la position donnée (WU). */
export function spawnCreature(
  templateKey: string,
  worldX: number,
  worldY: number,
  socket: any,
): Promise<ActionResult> {
  return ackPromise(socket, "admin:spawn", { templateKey, worldX, worldY });
}

/** Téléporte un personnage connecté (WU). */
export function teleportCharacter(
  characterId: string,
  worldX: number,
  worldY: number,
  socket: any,
): Promise<ActionResult> {
  return ackPromise(socket, "admin:teleport", { characterId, worldX, worldY });
}

/** Met à jour les stats d'un template via WS (broadcast category:updated). */
export function updateTemplate(
  key: string,
  fields: Record<string, number>,
  socket: any,
): Promise<ActionResult> {
  return ackPromise(socket, "admin:update_template", { key, fields });
}

/** Déplace un creature vivant à la position donnée (WU). */
export function moveCreature(creatureId: string, worldX: number, worldY: number, socket: any): Promise<ActionResult> {
  return ackPromise(socket, 'admin:move_creature', { creatureId, worldX, worldY });
}

/** Force le respawn de tous les animaux d'un template. */
export function respawnAll(templateKey: string, socket: any): Promise<ActionResult> {
  return ackPromise(socket, 'admin:respawn_all', { templateKey });
}

function formatMovementMetrics(metrics: MovementMetrics): string {
  return [
    `total=${metrics.totalMoves}`,
    `teleports=${metrics.suspectTeleports}`,
    `speed=${metrics.suspectSpeed}`,
    `invalid=${metrics.invalidCoordinates}`,
    `map=${metrics.mapMismatch}`,
  ].join("  ");
}

export async function getMovementMetrics(token: string): Promise<ActionResult> {
  try {
    const res = await fetch(`${API}/admin/movement-metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { success: false, message: `Erreur ${res.status}.` };
    }
    const metrics = await res.json() as MovementMetrics;
    return {
      success: true,
      message: `Movement metrics — ${formatMovementMetrics(metrics)}`,
      data: metrics,
    };
  } catch (e) {
    return { success: false, message: `Erreur réseau : ${String(e)}` };
  }
}

export async function resetMovementMetrics(token: string): Promise<ActionResult> {
  try {
    const res = await fetch(`${API}/admin/movement-metrics/reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { success: false, message: `Erreur ${res.status}.` };
    }
    const body = await res.json() as { metrics?: MovementMetrics };
    return {
      success: true,
      message: `Movement metrics reset — ${formatMovementMetrics(body.metrics ?? {
        totalMoves: 0,
        suspectTeleports: 0,
        suspectSpeed: 0,
        invalidCoordinates: 0,
        mapMismatch: 0,
      })}`,
      data: body.metrics,
    };
  } catch (e) {
    return { success: false, message: `Erreur réseau : ${String(e)}` };
  }
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
