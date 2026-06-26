// apps/client/src/components/DevTools/modules/PlayerRuntime/runtimeApi.ts
// Couche d'accès API isolée — testable sans dépendance React.

import type {
  ModifierFormInput,
  PlayerRuntimeSnapshot,
  RuntimeInspectableSnapshot,
  RuntimeModifier,
} from "./player-runtime.types";

const API = import.meta.env.VITE_API_URL as string;

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

export async function fetchSnapshot(): Promise<PlayerRuntimeSnapshot> {
  const res = await fetch(`${API}/player-runtime/me/snapshot`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<PlayerRuntimeSnapshot>;
}

export async function addDebugModifier(
  entityId: string,
  input: ModifierFormInput,
): Promise<RuntimeModifier> {
  const res = await fetch(`${API}/player-runtime/debug/modifiers`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    // L'endpoint debug est player-specific : le body attend "characterId".
    // On passe entityId comme valeur — pour un joueur, entityId === characterId.
    body: JSON.stringify({ characterId: entityId, ...input }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { added: RuntimeModifier };
  return data.added;
}

export async function clearDebugModifiers(entityId: string): Promise<void> {
  const res = await fetch(`${API}/player-runtime/debug/modifiers/${entityId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function listDebugModifiers(entityId: string): Promise<RuntimeModifier[]> {
  const res = await fetch(`${API}/player-runtime/debug/modifiers/${entityId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { modifiers: RuntimeModifier[] };
  return data.modifiers;
}

// ─── Creature Runtime ─────────────────────────────────────────────────────────

export async function fetchCreatureSnapshot(creatureId: string): Promise<RuntimeInspectableSnapshot> {
  const res = await fetch(`${API}/creature-runtime/${creatureId}/snapshot`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<RuntimeInspectableSnapshot>;
}

export async function addCreatureDebugModifier(
  creatureId: string,
  input: ModifierFormInput,
): Promise<RuntimeModifier> {
  const res = await fetch(`${API}/creature-runtime/debug/modifiers`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ creatureId, ...input }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { added: RuntimeModifier };
  return data.added;
}

export async function clearCreatureDebugModifiers(creatureId: string): Promise<void> {
  const res = await fetch(`${API}/creature-runtime/debug/modifiers/${creatureId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
