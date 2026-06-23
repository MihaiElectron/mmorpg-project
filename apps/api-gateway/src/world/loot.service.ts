// apps/api-gateway/src/world/loot.service.ts

import { Injectable } from '@nestjs/common';

export type LootResult = {
  itemId: string;
  quantity: number;
};

export interface LootPoolEntry {
  itemId: string;
  minQty: number;
  maxQty: number;
  probability: number;
}

function isValidEntry(e: unknown): e is LootPoolEntry {
  if (typeof e !== 'object' || e === null) return false;
  const entry = e as Record<string, unknown>;
  return (
    typeof entry.itemId === 'string' &&
    entry.itemId.length > 0 &&
    typeof entry.minQty === 'number' &&
    entry.minQty > 0 &&
    typeof entry.maxQty === 'number' &&
    entry.maxQty >= entry.minQty &&
    typeof entry.probability === 'number' &&
    entry.probability > 0
  );
}

@Injectable()
export class LootService {
  /**
   * Génère un loot depuis le pool template si fourni et valide.
   * Fallback vers le switch hardcodé si pool absent, vide, invalide ou si aucune
   * entrée ne passe le tirage de probabilité.
   */
  generateLoot(type: string, pool?: LootPoolEntry[] | null): LootResult {
    if (pool && pool.length > 0) {
      const fromPool = this.generateLootFromPool(pool);
      if (fromPool.quantity > 0) return fromPool;
    }
    switch (type) {
      case 'dead_tree':
        return { itemId: 'wooden_stick', quantity: 1 };
      case 'ore':
        return { itemId: 'iron_ore', quantity: 1 };
      default:
        return { itemId: 'unknown', quantity: 0 };
    }
  }

  /**
   * Tire un loot depuis un pool brut. Filtre les entrées invalides, puis tente
   * chaque entrée dans l'ordre selon sa probabilité. Retourne le premier succès,
   * ou `{ itemId: 'unknown', quantity: 0 }` si aucune entrée ne passe.
   */
  generateLootFromPool(pool: unknown[]): LootResult {
    const valid = pool.filter(isValidEntry);
    for (const entry of valid) {
      if (Math.random() < entry.probability) {
        const range = entry.maxQty - entry.minQty;
        const qty = Math.floor(Math.random() * (range + 1)) + entry.minQty;
        return { itemId: entry.itemId, quantity: qty };
      }
    }
    return { itemId: 'unknown', quantity: 0 };
  }
}
