// apps/api-gateway/src/world/world.service.ts

import { Injectable } from '@nestjs/common';
import { WorldSocket } from '../types/world-socket';
import { LootService } from './loot.service';
import { InventoryService } from '../inventory/inventory.service';
import { ResourcesService } from '../resources/resources.service';
import { ResourcesGateway } from '../resources/resources.gateway';

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
  /**
   * Sessions de gathering en cours, indexées par client.id
   */
  private gatheringSessions = new Map<string, GatheringSession>();

  /**
   * Objets du monde (placeholder — plus tard remplacé par DB)
   */
  private worldObjects: WorldObject[] = [
    { id: 'tree_1', type: 'dead_tree', x: 600, y: 500 },
    { id: 'tree_2', type: 'dead_tree', x: 600, y: 400 },
    { id: 'ore_1', type: 'ore', x: 700, y: 500 },
  ];

  constructor(
    private readonly lootService: LootService,
    private readonly inventoryService: InventoryService,

    /**
     * Services ajoutés pour gérer l’état des ressources
     * et broadcast via ResourcesGateway
     */
    private readonly resourcesService: ResourcesService,
    private readonly resourcesGateway: ResourcesGateway,
  ) {}

  // ---------------------------------------------------------------------------
  // Vérifie que le joueur est assez proche de l’objet
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // Récolte instantanée (sans timer)
  // ---------------------------------------------------------------------------
  async handleGather(
    client: WorldSocket,
    payload: { targetId: string; targetType: string },
  ) {
    const check = this.checkInteraction(client, { targetId: payload.targetId });
    if ('error' in check) return { success: false, error: check.error };

    const player = client.data.player;

    // 1) Génération du loot
    const loot = this.lootService.generateLoot(payload.targetType);

    try {
      // 2) Ajout dans l’inventaire
      const saved = await this.inventoryService.addItem({
        characterId: player.characterId,
        itemId: loot.itemId,
        quantity: loot.quantity,
      });

      // 3) Marquer la ressource comme récoltée dans la DB
      await this.resourcesService.markGathered(payload.targetId);

      // 4) Broadcast ressource_update à tous les joueurs
      this.resourcesGateway.server.emit('resource_update', {
        id: payload.targetId,
        state: 'dead',
      });

      // 5) Envoi au joueur de son inventaire mis à jour
      client.emit('inventory_update', {
        itemId: loot.itemId,
        quantity: loot.quantity,
        total: saved.quantity,
      });

      return { success: true, item: loot };
    } catch {
      return { success: false, error: 'Failed to add item to inventory' };
    }
  }

  // ---------------------------------------------------------------------------
  // Démarre un gathering sécurisé (timer serveur)
  // ---------------------------------------------------------------------------
  startGathering(
    client: WorldSocket,
    payload: { targetId: string; targetType: string },
  ) {
    const check = this.checkInteraction(client, { targetId: payload.targetId });
    if ('error' in check) return { success: false, error: check.error };

    // Stopper une session précédente
    this.stopGathering(client);

    const session: GatheringSession = {
      targetId: payload.targetId,
      targetType: payload.targetType,
    };

    const GATHERING_DURATION = 3000;

    // Timer serveur → évite le cheat client
    session.timer = setTimeout(() => {
      void this.completeGathering(client, session.targetId, session.targetType);
    }, GATHERING_DURATION);

    this.gatheringSessions.set(client.id, session);

    return { success: true, duration: GATHERING_DURATION };
  }

  // ---------------------------------------------------------------------------
  // Fin du gathering sécurisé
  // ---------------------------------------------------------------------------
  private async completeGathering(
    client: WorldSocket,
    targetId: string,
    targetType: string,
  ) {
    if (!client.connected) return;

    // Vérification anti-cheat : le joueur est-il toujours à portée ?
    const check = this.checkInteraction(client, { targetId });
    if ('error' in check) {
      this.stopGathering(client);
      client.emit('gathering_complete', {
        success: false,
        error: check.error,
      });
      return;
    }

    const player = client.data.player;

    // 1) Génération du loot
    const loot = this.lootService.generateLoot(targetType);

    try {
      // 2) Ajout inventaire
      const saved = await this.inventoryService.addItem({
        characterId: player.characterId,
        itemId: loot.itemId,
        quantity: loot.quantity,
      });

      // Note: On ne marque pas la ressource comme "dead" car le loot est infini/continu
      // tant qu'on ne bouge pas.

      // 3) Envoi inventaire au joueur
      client.emit('inventory_update', {
        itemId: loot.itemId,
        quantity: loot.quantity,
        total: saved.quantity,
      });

      // 4) Event de réussite du cycle
      client.emit('gathering_success', {
        item: loot,
      });

      // 5) Relance automatique du cycle (Loot continu)
      const session = this.gatheringSessions.get(client.id);
      if (session) {
        const GATHERING_DURATION = 3000;
        session.timer = setTimeout(() => {
          void this.completeGathering(client, targetId, targetType);
        }, GATHERING_DURATION);
      }
    } catch (e) {
      console.error('Gathering error:', e);
      this.stopGathering(client);
      client.emit('gathering_complete', {
        success: false,
        error: 'Failed to add item to inventory',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Stopper un gathering en cours
  // ---------------------------------------------------------------------------
  stopGathering(client: WorldSocket) {
    const session = this.gatheringSessions.get(client.id);

    if (session?.timer) clearTimeout(session.timer);

    this.gatheringSessions.delete(client.id);
  }
}
