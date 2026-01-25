// apps/api-gateway/src/world/loot.service.ts

import { Injectable } from '@nestjs/common';

export type LootResult = {
  itemId: string;
  quantity: number;
};

@Injectable()
export class LootService {
  generateLoot(type: string): LootResult {
    switch (type) {
      case 'dead_tree':
        return { itemId: 'wooden_stick', quantity: 1 };

      case 'ore':
        return { itemId: 'iron_ore', quantity: 1 };

      default:
        return { itemId: 'unknown', quantity: 0 };
    }
  }
}
