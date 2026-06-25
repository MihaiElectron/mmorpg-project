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
  characterId: string,
  input: ModifierFormInput,
): Promise<RuntimeModifier> {
  const res = await fetch(`${API}/player-runtime/debug/modifiers`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ characterId, ...input }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { added: RuntimeModifier };
  return data.added;
}

export async function clearDebugModifiers(characterId: string): Promise<void> {
  const res = await fetch(`${API}/player-runtime/debug/modifiers/${characterId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function listDebugModifiers(characterId: string): Promise<RuntimeModifier[]> {
  const res = await fetch(`${API}/player-runtime/debug/modifiers/${characterId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { modifiers: RuntimeModifier[] };
  return data.modifiers;
}
