import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { DataSource } from 'typeorm';
import type { WorldSocket } from '../types/world-socket';
import { WsAuthService } from '../common/ws-auth.service';
import { WorldItemService } from '../world-items/world-item.service';
import { ItemMaterializationService } from '../item-materialization/item-materialization.service';
import { ItemInstanceSource } from '../item-instances/enums/item-instance-source.enum';
import { CLIENT_ORIGIN } from '../common/cors.constants';
import { DEFAULT_MAP_ID } from '../common/world-coordinates';
import { getMapRoomId } from '../common/socket-rooms';
import { makeCombatEvent, COMBAT_EVENT } from '../creatures/combat-event';
import { SkillCastService, isSkillCastFailure } from './skill-cast.service';
import { parseSkillCastPayload } from './dto/skill-cast.dto';

/**
 * SkillsGateway — cast serveur d'un skill actif (Skills V1-D).
 *
 * Reçoit une INTENTION `skill:cast` du client, valide le payload puis délègue
 * toute la logique métier à `SkillCastService`. La gateway ne calcule aucun
 * dégât, aucune portée, aucun cooldown. Elle lit `characterId` et la position
 * depuis l'état socket serveur (`client.data.player`), jamais le payload.
 *
 * Erreurs : émises au SEUL lanceur (`skill:error`) — jamais de broadcast.
 */
@WebSocketGateway({ cors: { origin: CLIENT_ORIGIN } })
export class SkillsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly skillCast: SkillCastService,
    private readonly wsAuthService: WsAuthService,
    private readonly worldItemService: WorldItemService,
    private readonly itemMaterialization: ItemMaterializationService,
    private readonly dataSource: DataSource,
  ) {}

  async handleConnection(client: WorldSocket) {
    // Auth cohérente avec les autres gateways : un socket non authentifié est
    // fermé. `client.data.player` est posé par WorldGateway (join_world).
    const auth = await this.wsAuthService.authenticate(client);
    if (!auth) {
      client.disconnect(true);
      return;
    }
    client.data.userId = auth.userId;
    client.data.role = auth.role;
  }

  @SubscribeMessage('skill:cast')
  async onSkillCast(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() rawPayload: unknown,
  ) {
    const payload = parseSkillCastPayload(rawPayload);
    if (!payload) {
      client.emit('skill:error', { error: 'Payload invalide.' });
      return;
    }

    const player = client.data.player;
    if (!player?.characterId) {
      client.emit('skill:error', { skillKey: payload.skillKey, error: 'Personnage non connecté.' });
      return;
    }

    // ── Skill de soin sur soi (V1-G) — aucun broadcast, resync au lanceur ──
    if (payload.targetType === 'self') {
      const selfResult = await this.skillCast.castSelfSkill(player.characterId, payload.skillKey);
      if (isSkillCastFailure(selfResult)) {
        client.emit('skill:error', { skillKey: payload.skillKey, error: selfResult.error });
        return;
      }
      // Conservé pour la compat V1-G (resync HP du panneau/HUD).
      client.emit('character_health_update', {
        characterId: player.characterId,
        health: selfResult.health,
        heal: selfResult.heal,
      });
      // Ressources complètes (santé + mana/énergie) au seul lanceur.
      if (selfResult.resources) {
        client.emit('character_resource_update', {
          characterId: player.characterId,
          ...selfResult.resources,
        });
      }
      client.emit('skill:cooldown', {
        skillKey: selfResult.skillKey,
        cooldownMs: selfResult.cooldownMs,
        readyAt: Date.now() + selfResult.cooldownMs,
      });
      return;
    }

    const result = await this.skillCast.castCreatureSkill(
      player.characterId,
      { worldX: player.worldX, worldY: player.worldY, mapId: player.mapId },
      payload.skillKey,
      payload.targetId,
    );

    if (isSkillCastFailure(result)) {
      // Erreur au seul lanceur — jamais de broadcast.
      client.emit('skill:error', { skillKey: payload.skillKey, error: result.error });
      return;
    }

    const mapId = result.dto.mapId ?? DEFAULT_MAP_ID;
    const room = getMapRoomId(mapId);

    // Mise à jour de la créature (room map).
    this.server.to(room).emit('creature_update', result.dto);

    // Combat Event — dégâts skill joueur → créature (position = créature).
    this.server.to(room).emit(
      COMBAT_EVENT,
      makeCombatEvent({
        type: 'damage',
        amount: result.damage,
        sourceType: 'player',
        sourceId: result.attackerId,
        targetType: 'creature',
        targetId: result.dto.id,
        worldX: result.dto.worldX ?? 0,
        worldY: result.dto.worldY ?? 0,
        text: `-${result.damage}`,
        skillName: result.skillName,
        isCritical: result.isCritical,
        targetName: result.dto.name,
        targetDied: result.killed,
        isDodged: result.isDodged,
      }),
    );
    if (result.killed) {
      this.server.to(room).emit(
        COMBAT_EVENT,
        makeCombatEvent({
          type: 'death',
          amount: result.damage,
          sourceType: 'player',
          sourceId: result.attackerId,
          targetType: 'creature',
          targetId: result.dto.id,
          worldX: result.dto.worldX ?? 0,
          worldY: result.dto.worldY ?? 0,
          skillName: result.skillName,
          isCritical: result.isCritical,
          targetName: result.dto.name,
          targetDied: true,
        }),
      );
    }

    // XP personnage (kill) au seul lanceur.
    if (result.characterXpUpdate) {
      client.emit('character_xp_update', result.characterXpUpdate);
    }

    // Coût de vie appliqué : resync HP du lanceur via l'event existant.
    if (result.healthCost) {
      client.emit('character_damaged', {
        characterId: player.characterId,
        damage: result.healthCost.amount,
        health: result.healthCost.health,
      });
    }

    // Ressources complètes (santé + mana/énergie) au seul lanceur, si un coût
    // a été prélevé (mana/énergie/santé). Émis même si la santé n'a pas changé.
    if (result.resources) {
      client.emit('character_resource_update', {
        characterId: player.characterId,
        ...result.resources,
      });
    }

    // Cooldown au seul lanceur.
    client.emit('skill:cooldown', {
      skillKey: result.skillKey,
      cooldownMs: result.cooldownMs,
      readyAt: Date.now() + result.cooldownMs,
    });

    // Loot au sol (même pipeline que CreaturesGateway).
    if (result.loot && result.loot.length > 0) {
      try {
        const matResult = await this.dataSource.transaction(async (manager) => {
          return this.itemMaterialization.materialize(manager, result.loot!, {
            source: ItemInstanceSource.LOOT,
            destination: {
              type: 'WORLD',
              worldX: result.dto.worldX ?? 0,
              worldY: result.dto.worldY ?? 0,
              mapId,
              ownerCharacterId: null,
            },
            ownerId: player.characterId,
          });
        });
        for (const wi of matResult.worldItems) {
          this.server.to(getMapRoomId(wi.mapId)).emit('world_item_spawn', this.worldItemService.toDto(wi));
        }
      } catch (err) {
        console.warn('[SkillsGateway] spawn loot WorldItem ignoré:', (err as Error).message);
      }
    }
  }
}
