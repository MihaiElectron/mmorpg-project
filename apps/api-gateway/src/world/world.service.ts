// apps/api-gateway/src/world/world.service.ts

import { Injectable } from '@nestjs/common';
import { WorldSocket } from '../types/world-socket';
import { LootService } from './loot.service';
import { InventoryService } from '../inventory/inventory.service';

type WorldObject = {
  id: string;
  type: string;
  x: number;
  y: number;
};

type GatheringSession = {
  targetId: string;
  targetType: string;
  timer?: NodeJS.Timeout;
};

@Injectable()
export class WorldService {
  private gatheringSessions = new Map<string, GatheringSession>();

  private worldObjects: WorldObject[] = [
    { id: 'tree_1', type: 'dead_tree', x: 500, y: 300 },
    { id: 'tree_2', type: 'dead_tree', x: 600, y: 400 },
    { id: 'ore_1', type: 'ore', x: 700, y: 500 },
  ];

  constructor(
    private readonly lootService: LootService,
    private readonly inventoryService: InventoryService,
  ) {}

  checkInteraction(client: WorldSocket, payload: { targetId: string }) {
    const target = this.worldObjects.find((obj) => obj.id === payload.targetId);
    if (!target) return { error: 'Object not found' };

    const player = client.data.player;

    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 100) return { error: 'Too far from object' };

    return { target };
  }

  async handleGather(
    client: WorldSocket,
    payload: { targetId: string; targetType: string },
  ) {
    const check = this.checkInteraction(client, { targetId: payload.targetId });
    if ('error' in check) return { success: false, error: check.error };

    const loot = this.lootService.generateLoot(payload.targetType);
    const player = client.data.player;

    try {
      await this.inventoryService.addItem({
        characterId: player.characterId,
        itemId: loot.itemId,
        quantity: loot.quantity,
      });
    } catch {
      return { success: false, error: 'Failed to add item to inventory' };
    }

    return { success: true, item: loot };
  }

  startGathering(
    client: WorldSocket,
    payload: { targetId: string; targetType: string },
  ) {
    const check = this.checkInteraction(client, { targetId: payload.targetId });
    if ('error' in check) return { success: false, error: check.error };

    this.stopGathering(client);

    const session: GatheringSession = {
      targetId: payload.targetId,
      targetType: payload.targetType,
    };

    const GATHERING_DURATION = 3000;

    session.timer = setTimeout(() => {
      void this.completeGathering(client, payload.targetType);
    }, GATHERING_DURATION);

    this.gatheringSessions.set(client.id, session);

    return { success: true, duration: GATHERING_DURATION };
  }

  private async completeGathering(client: WorldSocket, targetType: string) {
    if (!client.connected) return;

    const loot = this.lootService.generateLoot(targetType);
    const player = client.data.player;

    try {
      await this.inventoryService.addItem({
        characterId: player.characterId,
        itemId: loot.itemId,
        quantity: loot.quantity,
      });

      client.emit('gathering_complete', {
        success: true,
        item: loot,
      });
    } catch {
      client.emit('gathering_complete', {
        success: false,
        error: 'Failed to add item to inventory',
      });
    }

    this.gatheringSessions.delete(client.id);
  }

  stopGathering(client: WorldSocket) {
    const session = this.gatheringSessions.get(client.id);

    if (session?.timer) clearTimeout(session.timer);

    this.gatheringSessions.delete(client.id);
  }
}
