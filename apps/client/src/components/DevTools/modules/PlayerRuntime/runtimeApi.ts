// apps/client/src/components/DevTools/modules/PlayerRuntime/runtimeApi.ts
// Couche d'accès API isolée — testable sans dépendance React.

import type { ModifierFormInput, PlayerRuntimeSnapshot, RuntimeModifier } from "./player-runtime.types";

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
