import { fetchItems } from "../Items/itemEditorApi";
import {
  buildLootPoolSources,
  normalizeLootPool,
} from "./lootPoolEditor";
import type {
  CreatureTemplateDto,
  LootPoolData,
  LootPoolEntry,
  ResourceTemplateDto,
} from "./lootPool.types";

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

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<T>;
}

export async function fetchLootPoolData(): Promise<LootPoolData> {
  const [items, resources, creatures] = await Promise.all([
    fetchItems(),
    fetchJson<ResourceTemplateDto[]>("/admin/resource-templates"),
    fetchJson<CreatureTemplateDto[]>("/admin/templates"),
  ]);

  return {
    items,
    sources: buildLootPoolSources(resources, creatures),
  };
}

export async function updateResourceLootPool(
  type: string,
  lootPool: LootPoolEntry[],
): Promise<LootPoolEntry[]> {
  const updated = await patchJson<ResourceTemplateDto>(
    `/admin/resource-templates/${encodeURIComponent(type)}`,
    { lootPool },
  );
  return normalizeLootPool(updated.lootPool);
}

export async function updateCreatureLootPool(
  key: string,
  lootPool: LootPoolEntry[],
): Promise<LootPoolEntry[]> {
  const updated = await patchJson<CreatureTemplateDto>(
    `/admin/templates/${encodeURIComponent(key)}`,
    { lootPool },
  );
  return normalizeLootPool(updated.lootPool);
}
