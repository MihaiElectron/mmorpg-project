import type {
  ItemCatalogEntry,
  ItemEditorPatch,
  ItemUsageStats,
} from "./itemEditor.types";

const API = import.meta.env.VITE_API_URL as string;

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` };
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return typeof body.message === "string"
    ? body.message
    : `Erreur ${res.status}`;
}

export async function fetchItems(): Promise<ItemCatalogEntry[]> {
  const res = await fetch(`${API}/item`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ItemCatalogEntry[]>;
}

export async function updateItem(
  id: string,
  patch: ItemEditorPatch,
): Promise<ItemCatalogEntry> {
  const res = await fetch(`${API}/item/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ItemCatalogEntry>;
}

export async function fetchItemUsageStats(id: string): Promise<ItemUsageStats> {
  const res = await fetch(`${API}/item/${id}/stats`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ItemUsageStats>;
}
