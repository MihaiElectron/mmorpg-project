import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { WorldSocket } from '../types/world-socket';
import { CLIENT_ORIGIN } from '../common/cors.constants';
import { CharacterService } from '../characters/character.service';
import { CraftingService } from './crafting.service';

type CraftStartPayload = { recipeId: string; quantity: number };
type CraftStartResult = { success: boolean; message?: string; data?: unknown };

/**
 * CraftingGateway — event craft:start
 *
 * Partage le namespace Socket.IO par défaut avec WorldGateway (même connexion socket).
 * WorldGateway.handleConnection() authentifie le client et positionne client.data.userId.
 * Ce gateway ne re-authentifie pas : il vérifie client.data.userId et rejette si absent.
 *
 * characterId est TOUJOURS résolu côté serveur depuis client.data.userId.
 * Jamais accepté depuis le payload client.
 *
 * Émissions :
 *   craft:result → client demandeur uniquement (jamais broadcast)
 */
@WebSocketGateway({ cors: { origin: CLIENT_ORIGIN } })
export class CraftingGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly craftingService: CraftingService,
    private readonly characterService: CharacterService,
  ) {}

  @SubscribeMessage('craft:start')
  async onCraftStart(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: CraftStartPayload,
  ): Promise<CraftStartResult> {
    if (!client.data.userId) {
      return { success: false, message: 'Non authentifié' };
    }

    const { recipeId, quantity } = payload ?? {};
    if (
      typeof recipeId !== 'string' ||
      !recipeId ||
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      return {
        success: false,
        message: 'Payload invalide : recipeId (string) et quantity (entier 1–99) requis',
      };
    }

    try {
      const character = await this.characterService.findFirstByUser(client.data.userId);
      const result = await this.craftingService.craft(character.id, recipeId, quantity);
      client.emit('craft:result', { success: true, data: result });
      if (result.skill && result.skill.key) {
        client.emit('skill_update', {
          key: result.skill.key,
          level: result.skill.newLevel,
          xp: result.skill.newXp,
          nextLevelXp: result.skill.nextLevelXp,
          leveledUp: result.skill.newLevel > result.skill.previousLevel,
        });
      }
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      return { success: false, message };
    }
  }
}
