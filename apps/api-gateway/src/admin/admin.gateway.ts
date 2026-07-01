import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { WorldSocket } from '../types/world-socket';
import { CreaturesService } from '../creatures/creatures.service';
import { WorldService } from '../world/world.service';
import { AdminService } from './admin.service';
import { ResourcesService } from '../resources/resources.service';
import { BuildingsService } from '../buildings/buildings.service';
import { WsAuthService } from '../common/ws-auth.service';
import { CLIENT_ORIGIN } from '../common/cors.constants';
import { DEFAULT_MAP_ID } from '../common/world-coordinates';
import { getMapRoomId } from '../common/socket-rooms';
import { toBuildingWorldObject } from '../buildings/adapters/building-world-object.adapter';
import { EconomyService } from '../economy/economy.service';
import { TransactionType } from '../economy/entities/economic-transaction.entity';
import { DataSource } from 'typeorm';
import { ItemMaterializationService } from '../item-materialization/item-materialization.service';
import { ItemInstanceSource } from '../item-instances/enums/item-instance-source.enum';

type AddBalancePayload = {
  characterId: string;
  /** Montant en bronze pur (rétrocompatibilité). */
  amountBronze?: number;
  /** Montant ou solde cible exprimé en or / argent / bronze. */
  gold?: number;
  silver?: number;
  bronze?: number;
  direction: 'credit' | 'debit' | 'set';
};

type SpawnPayload = { templateKey: string; worldX: number; worldY: number };
type TeleportPayload = {
  characterId: string;
  targetCharacterId?: string;
  worldX?: number;
  worldY?: number;
};
type UpdateTemplatePayload = { key: string; fields: Record<string, number> };
type RespawnAllPayload = { templateKey: string };
type MoveCreaturePayload = { creatureId: string; worldX: number; worldY: number };
type UpdateEntityPayload = { id: string; fields: Record<string, number> };
type SkillDefinitionCreatePayload = { fields: Record<string, unknown> };
type SkillDefinitionUpdatePayload = { id: string; fields: Record<string, unknown> };
type CraftingStationTemplateCreatePayload = { fields: Record<string, unknown> };
type CraftingStationTemplateUpdatePayload = { id: string; fields: Record<string, unknown> };
type BuildingTemplateCreatePayload = { fields: Record<string, unknown> };
type BuildingTemplateUpdatePayload = { id: string; fields: Record<string, unknown> };
type BuildingCreatePayload = { templateId: string; worldX: number; worldY: number; mapId?: number };
type BuildingUpdatePayload = { id: string; fields: Record<string, unknown> };

type CmdResult = { success: boolean; message: string; data?: unknown };
type GiveItemPayload = { characterId: string; itemId: string; quantity?: number };

@WebSocketGateway({ cors: { origin: CLIENT_ORIGIN } })
export class AdminGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly creaturesService: CreaturesService,
    private readonly worldService: WorldService,
    private readonly adminService: AdminService,
    private readonly resourcesService: ResourcesService,
    private readonly buildingsService: BuildingsService,
    private readonly wsAuthService: WsAuthService,
    private readonly economyService: EconomyService,
    private readonly dataSource: DataSource,
    private readonly itemMaterializationService: ItemMaterializationService,
  ) {}

  private emitReloadIfConnected(characterId: string): void {
    const target = this.worldService.getConnectedPlayerByCharacterId(characterId);
    if (target) this.server.to(target.socketId).emit('character:reload');
  }

  async handleConnection(client: WorldSocket) {
    const auth = await this.wsAuthService.authenticate(client);
    if (!auth) {
      client.disconnect(true);
      return;
    }
    client.data.userId = auth.userId;
    client.data.role = auth.role;
  }

  @SubscribeMessage('admin:spawn')
  async onSpawn(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: SpawnPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') {
      return { success: false, message: 'Non autorisé.' };
    }

    const { templateKey, worldX, worldY } = payload ?? {};
    if (!templateKey || typeof worldX !== 'number' || typeof worldY !== 'number') {
      return { success: false, message: 'Payload invalide : templateKey, worldX, worldY requis.' };
    }

    const dto = await this.creaturesService.createAdminSpawn(templateKey, worldX, worldY);
    if (!dto) {
      return { success: false, message: `Template "${templateKey}" introuvable.` };
    }

    this.server.to(getMapRoomId(dto.mapId ?? DEFAULT_MAP_ID)).emit('creature_update', dto);
    return {
      success: true,
      message: `"${dto.name}" spawné en WU (${Math.round(worldX)}, ${Math.round(worldY)}). ID: ${dto.id}`,
      data: dto,
    };
  }

  @SubscribeMessage('admin:teleport')
  async onTeleport(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: TeleportPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') {
      return { success: false, message: 'Non autorisé.' };
    }

    const { characterId: rawId, targetCharacterId, worldX: rawWorldX, worldY: rawWorldY } = payload ?? {};
    if (!rawId) {
      return { success: false, message: 'Payload invalide : characterId requis.' };
    }

    const admin = this.worldService.findPlayerByNameOrId(rawId);
    if (!admin) {
      return { success: false, message: `Admin "${rawId}" introuvable ou non connecté.` };
    }

    let worldX: number;
    let worldY: number;

    if (targetCharacterId) {
      const target = this.worldService.getConnectedPlayerByCharacterId(targetCharacterId);
      if (target) {
        worldX = target.worldX;
        worldY = target.worldY;
      } else {
        const dbChar = await this.adminService.findCharacterById(targetCharacterId);
        if (!dbChar) {
          return { success: false, message: `Joueur cible "${targetCharacterId}" introuvable.` };
        }
        worldX = dbChar.worldX;
        worldY = dbChar.worldY;
      }
    } else {
      if (typeof rawWorldX !== 'number' || typeof rawWorldY !== 'number') {
        return { success: false, message: 'Payload invalide : worldX et worldY requis si targetCharacterId absent.' };
      }
      worldX = rawWorldX;
      worldY = rawWorldY;
    }

    const player = await this.worldService.teleportCharacter(admin.characterId, worldX, worldY, this.server);
    if (!player) {
      return { success: false, message: `Admin "${rawId}" introuvable ou non connecté.` };
    }

    return {
      success: true,
      message: `"${player.name}" (${player.characterId}) téléporté en WU (${Math.round(worldX)}, ${Math.round(worldY)}).`,
      data: { characterId: player.characterId, name: player.name },
    };
  }

  @SubscribeMessage('admin:update_template')
  async onUpdateTemplate(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: UpdateTemplatePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') {
      return { success: false, message: 'Non autorisé.' };
    }

    const { key, fields } = payload ?? {};
    if (!key || !fields || typeof fields !== 'object') {
      return { success: false, message: 'Payload invalide : key et fields requis.' };
    }

    const numericAllowed = ['baseHealth', 'aggroRadius', 'baseAttack', 'baseArmor', 'fleeThresholdPct', 'patrolRadius', 'respawnDelayMs', 'killCharacterXpReward'];
    const stringAllowed = ['name', 'textureKey'];
    const allAllowed = [...numericAllowed, ...stringAllowed];
    const safeFields: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!allAllowed.includes(k)) {
        return { success: false, message: `Champ "${k}" non modifiable.` };
      }
      if (stringAllowed.includes(k)) {
        if (typeof v !== 'string' || String(v).trim() === '') {
          return { success: false, message: `"${k}" doit être une chaîne non vide.` };
        }
        safeFields[k] = String(v).trim();
      } else {
        const n = Number(v);
        if (k === 'respawnDelayMs') {
          if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > 86_400_000) {
            return { success: false, message: 'respawnDelayMs doit être un entier > 0 et <= 86 400 000 ms (24h).' };
          }
        } else if (isNaN(n) || n < 0) {
          return { success: false, message: `Valeur invalide pour "${k}" : doit être >= 0.` };
        }
        safeFields[k] = n;
      }
    }

    // Lire les valeurs actuelles pour le message avant/après
    const templates = await this.adminService.getTemplates();
    const current = templates.find((t) => t.key === key);
    if (!current) {
      return { success: false, message: `Template "${key}" introuvable.` };
    }

    const beforeValues: Record<string, number | string> = {};
    for (const k of Object.keys(safeFields)) {
      beforeValues[k] = (current as any)[k];
    }

    const updated = await this.adminService.updateTemplate(key, safeFields as any);
    if (!updated) {
      return { success: false, message: `Échec de la mise à jour du template "${key}".` };
    }

    const changes = Object.entries(safeFields)
      .map(([k, v]) => `${k} ${beforeValues[k]}→${v}`)
      .join(', ');

    this.creaturesService.refreshTemplateInMemory(key, safeFields as any);
    this.server.emit('category:updated', updated);
    return {
      success: true,
      message: `Template "${updated.name}" mis à jour : ${changes}.`,
      data: updated,
    };
  }

  @SubscribeMessage('admin:move_creature')
  async onMoveCreature(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: MoveCreaturePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') {
      return { success: false, message: 'Non autorisé.' };
    }

    const { creatureId, worldX, worldY } = payload ?? {};
    if (!creatureId || typeof worldX !== 'number' || typeof worldY !== 'number') {
      return { success: false, message: 'Payload invalide : creatureId, worldX, worldY requis.' };
    }

    const dto = await this.creaturesService.moveCreature(creatureId, worldX, worldY);
    if (!dto) {
      return { success: false, message: `Creature "${creatureId}" introuvable ou mort.` };
    }

    return {
      success: true,
      message: `"${dto.name}" (${dto.id}) déplacé en WU (${Math.round(worldX)}, ${Math.round(worldY)}).`,
      data: dto,
    };
  }

  @SubscribeMessage('admin:respawn_all')
  async onRespawnAll(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: RespawnAllPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') {
      return { success: false, message: 'Non autorisé.' };
    }

    const { templateKey } = payload ?? {};
    if (!templateKey) {
      return { success: false, message: 'Payload invalide : templateKey requis.' };
    }

    const count = await this.creaturesService.forceRespawnAll(templateKey);
    return {
      success: count > 0,
      message: count > 0
        ? `${count} "${templateKey}" réinitialisé(s) à leur position de spawn (state: alive, HP max).`
        : `Aucun creature "${templateKey}" trouvé en mémoire.`,
    };
  }

  @SubscribeMessage('admin:update_creature')
  async onUpdateCreature(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: UpdateEntityPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const numericAllowed = ['health', 'worldX', 'worldY', 'respawnDelayMs'];
    const validStates = ['alive', 'fighting', 'escaping', 'dead'];
    const safe: Record<string, number | string | null> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'state') {
        if (!validStates.includes(String(v))) return { success: false, message: `État invalide : "${v}". Valeurs : ${validStates.join(', ')}.` };
        safe[k] = String(v);
      } else if (k === 'respawnDelayMs') {
        const n = Number(v);
        if (isNaN(n) || n < 0) return { success: false, message: 'Valeur invalide pour "respawnDelayMs" : doit être >= 0 (0 = hérite du template).' };
        if (n > 0 && n > 86_400_000) return { success: false, message: 'respawnDelayMs doit être <= 86 400 000 ms (24h).' };
        safe[k] = n === 0 ? null : n;
      } else if (numericAllowed.includes(k)) {
        const n = Number(v);
        if (isNaN(n)) return { success: false, message: `Valeur invalide pour "${k}".` };
        safe[k] = n;
      } else {
        return { success: false, message: `Champ "${k}" non modifiable.` };
      }
    }

    const dto = await this.creaturesService.adminUpdateCreature(id, safe as any);
    if (!dto) return { success: false, message: `Creature "${id}" introuvable ou mort.` };

    const changes = Object.entries(safe).map(([k, v]) => `${k}→${v}`).join(', ');
    return { success: true, message: `"${dto.name}" (${dto.id}) mis à jour : ${changes}.`, data: dto };
  }

  @SubscribeMessage('admin:update_resource_template')
  async onUpdateResourceTemplate(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { type: string; fields: Record<string, number | string | null> },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { type, fields } = payload ?? {};
    if (!type || !fields) return { success: false, message: 'Payload invalide : type et fields requis.' };

    const numericFields = ['defaultRemainingLoots', 'respawnDelayMs', 'gatheringXpReward'];
    const allowed = [...numericFields, 'skillKey', 'textureKey'];
    const safe: Record<string, number | string | null> = {};

    for (const [k, v] of Object.entries(fields)) {
      if (!allowed.includes(k)) return { success: false, message: `Champ "${k}" non modifiable.` };

      if (k === 'skillKey') {
        if (v !== null && (typeof v !== 'string' || (v as string).trim() === '')) {
          return { success: false, message: 'skillKey doit être une chaîne non vide ou null.' };
        }
        safe.skillKey = v === null || v === '' ? null : (v as string).trim();
      } else if (k === 'textureKey') {
        if (typeof v !== 'string' || (v as string).trim() === '') {
          return { success: false, message: 'textureKey doit être une chaîne non vide.' };
        }
        safe.textureKey = (v as string).trim();
      } else {
        const n = Number(v);
        if (isNaN(n)) return { success: false, message: `Valeur invalide pour "${k}" (doit être un nombre).` };
        if ((k === 'defaultRemainingLoots' || k === 'respawnDelayMs') && n <= 0) {
          return { success: false, message: `Valeur invalide pour "${k}" (doit être > 0).` };
        }
        if (k === 'gatheringXpReward' && n < 0) {
          return { success: false, message: 'gatheringXpReward doit être >= 0.' };
        }
        safe[k] = n;
      }
    }

    let updated: import('../resources/entities/resource-template.entity').ResourceTemplate | null;
    try {
      updated = await this.adminService.updateResourceTemplate(type, safe as any);
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la mise à jour.' };
    }
    if (!updated) return { success: false, message: `Template ressource "${type}" introuvable.` };

    const parts: string[] = [];
    if (safe.defaultRemainingLoots !== undefined) parts.push(`loots défaut → ${updated.defaultRemainingLoots}`);
    if (safe.respawnDelayMs        !== undefined) parts.push(`respawn → ${updated.respawnDelayMs} ms`);
    if (safe.gatheringXpReward     !== undefined) parts.push(`xp récolte → ${updated.gatheringXpReward}`);
    if ('skillKey' in safe) parts.push(`skill → ${updated.skillKey ?? 'aucun'}`);
    if (safe.textureKey            !== undefined) parts.push(`texture → ${updated.textureKey}`);
    return { success: true, message: `Template "${type}" mis à jour : ${parts.join(', ')}.`, data: updated };
  }

  @SubscribeMessage('admin:spawn_resource')
  async onSpawnResource(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { type: string; worldX: number; worldY: number },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { type, worldX, worldY } = payload ?? {};
    if (!type || typeof worldX !== 'number' || typeof worldY !== 'number')
      return { success: false, message: 'Payload invalide : type, worldX, worldY requis.' };

    const resource = await this.adminService.createResource(type, worldX, worldY);
    this.server.to(getMapRoomId(resource.mapId ?? DEFAULT_MAP_ID)).emit('resource_update', this.resourcesService.buildResourceBroadcast(resource));
    return {
      success: true,
      message: `Ressource "${type}" créée en WU (${Math.round(worldX)}, ${Math.round(worldY)}). ID: ${resource.id}`,
    };
  }

  @SubscribeMessage('admin:delete_creature')
  async onDeleteCreature(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { id: string },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id } = payload ?? {};
    if (!id) return { success: false, message: 'Payload invalide : id requis.' };

    const dto = await this.creaturesService.adminDeleteCreature(id);
    if (!dto) return { success: false, message: `Creature "${id}" introuvable en mémoire.` };

    this.server.to(getMapRoomId(dto.mapId ?? DEFAULT_MAP_ID)).emit('creature_update', { ...dto, state: 'dead' });
    return { success: true, message: `"${dto.name}" (${dto.id}) supprimé.` };
  }

  @SubscribeMessage('admin:delete_resource')
  async onDeleteResource(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { id: string },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id } = payload ?? {};
    if (!id) return { success: false, message: 'Payload invalide : id requis.' };

    const deleted = await this.adminService.deleteResource(id);
    if (!deleted) return { success: false, message: `Ressource "${id}" introuvable.` };

    this.server.to(getMapRoomId(deleted.mapId ?? DEFAULT_MAP_ID)).emit('resource_update', { id: deleted.id, state: 'dead', deleted: true });
    return { success: true, message: `Ressource "${deleted.type}" (${deleted.id}) supprimée.` };
  }

  @SubscribeMessage('admin:update_character')
  async onUpdateCharacter(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: UpdateEntityPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const allowed = ['level', 'health', 'maxHealth', 'attack', 'defense'];
    const safe: Record<string, number> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!allowed.includes(k)) return { success: false, message: `Champ "${k}" non modifiable.` };
      const n = Number(v);
      if (isNaN(n) || n < 0) return { success: false, message: `Valeur invalide pour "${k}".` };
      safe[k] = n;
    }

    const updated = await this.adminService.updateCharacter(id, safe as any);
    if (!updated) return { success: false, message: `Personnage "${id}" introuvable.` };

    this.emitReloadIfConnected(id);
    const changes = Object.entries(safe).map(([k, v]) => `${k}→${v}`).join(', ');
    return { success: true, message: `"${updated.name}" mis à jour : ${changes}.`, data: updated };
  }

  @SubscribeMessage('admin:get_wallet')
  async onGetWallet(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { characterId: string },
  ): Promise<CmdResult & { gold?: number; silver?: number; bronze?: number }> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };
    const { characterId } = payload ?? {};
    if (!characterId) return { success: false, message: 'characterId requis.' };
    const character = await this.adminService.findCharacterById(characterId);
    if (!character) return { success: false, message: `Personnage introuvable.` };
    const wallet = await this.economyService.getOrCreateWallet('character', characterId);
    const total = BigInt(wallet.balanceBronze);
    return {
      success: true,
      message: 'OK',
      gold:   Number(total / 10_000n),
      silver: Number((total % 10_000n) / 100n),
      bronze: Number(total % 100n),
    };
  }

  @SubscribeMessage('admin:add_balance')
  async onAddBalance(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: AddBalancePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { characterId, amountBronze, gold, silver, bronze, direction } = payload ?? {};
    if (!characterId) return { success: false, message: 'characterId requis.' };
    if (direction !== 'credit' && direction !== 'debit' && direction !== 'set') {
      return { success: false, message: 'direction doit être "credit", "debit" ou "set".' };
    }

    // Résolution du montant total en bronze
    let totalBronze: bigint;
    if (typeof gold === 'number' || typeof silver === 'number' || typeof bronze === 'number') {
      const g = Math.floor(gold ?? 0);
      const s = Math.floor(silver ?? 0);
      const b = Math.floor(bronze ?? 0);
      if (g < 0 || s < 0 || b < 0) return { success: false, message: 'Les valeurs or, argent et bronze doivent être positives ou nulles.' };
      totalBronze = BigInt(g) * 10_000n + BigInt(s) * 100n + BigInt(b);
    } else if (typeof amountBronze === 'number' && Number.isFinite(amountBronze)) {
      totalBronze = BigInt(Math.floor(amountBronze));
    } else {
      return { success: false, message: 'Montant invalide : fournir gold/silver/bronze ou amountBronze.' };
    }

    if (direction !== 'set' && totalBronze <= 0n) return { success: false, message: 'Le montant doit être strictement positif.' };
    if (totalBronze < 0n) return { success: false, message: 'Le solde cible ne peut pas être négatif.' };
    if (totalBronze > 1_000_000_000n) return { success: false, message: 'Montant trop élevé (max 1 000 000 000 bronze).' };

    const character = await this.adminService.findCharacterById(characterId);
    if (!character) return { success: false, message: `Personnage "${characterId}" introuvable.` };

    const wallet = await this.economyService.getOrCreateWallet('character', characterId);

    try {
      if (direction === 'credit') {
        await this.economyService.credit({
          type: TransactionType.ADMIN,
          destinationWalletId: wallet.id,
          amountBronze: totalBronze,
          actorId: client.data.userId,
        });
      } else if (direction === 'debit') {
        await this.economyService.debit({
          type: TransactionType.ADMIN,
          sourceWalletId: wallet.id,
          amountBronze: totalBronze,
          actorId: client.data.userId,
        });
      } else {
        // set : calculer le delta et créditer ou débiter
        const current = BigInt(wallet.balanceBronze);
        const delta = totalBronze - current;
        if (delta > 0n) {
          await this.economyService.credit({
            type: TransactionType.ADMIN,
            destinationWalletId: wallet.id,
            amountBronze: delta,
            actorId: client.data.userId,
          });
        } else if (delta < 0n) {
          await this.economyService.debit({
            type: TransactionType.ADMIN,
            sourceWalletId: wallet.id,
            amountBronze: -delta,
            actorId: client.data.userId,
          });
        }
      }

      const refreshed = await this.economyService.getOrCreateWallet('character', characterId);
      const newTotal = BigInt(refreshed.balanceBronze);
      const g = Number(newTotal / 10_000n);
      const s = Number((newTotal % 10_000n) / 100n);
      const b = Number(newTotal % 100n);
      this.emitReloadIfConnected(characterId);
      const sign = direction === 'credit' ? '+' : direction === 'debit' ? '-' : '=';
      return {
        success: true,
        message: `${character.name} : ${sign}${totalBronze} bronze → solde ${g}g ${s}a ${b}b.`,
      };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur économique.' };
    }
  }

  @SubscribeMessage('admin:give_item')
  async onGiveItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: GiveItemPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { characterId, itemId, quantity } = payload ?? {};
    if (!characterId || !itemId) return { success: false, message: 'characterId et itemId requis.' };

    const qty = Math.max(1, Math.floor(Number(quantity) || 1));

    const character = await this.adminService.findCharacterById(characterId);
    if (!character) return { success: false, message: `Personnage "${characterId}" introuvable.` };

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        return this.itemMaterializationService.materialize(
          manager,
          [{ itemId, quantity: qty }],
          {
            source: ItemInstanceSource.ADMIN,
            ownerId: characterId,
            destination: { type: 'INVENTORY', characterId },
          },
        );
      });

      if (result.stacks.length === 0 && result.instances.length === 0) {
        return { success: false, message: `Item "${itemId}" introuvable dans le catalogue.` };
      }

      this.emitReloadIfConnected(characterId);

      const total = result.stacks.length + result.instances.length;
      return {
        success: true,
        message: `${total} objet(s) donné(s) à "${character.name}".`,
        data: result,
      };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de l\'injection.' };
    }
  }

  @SubscribeMessage('admin:create_creature_template')
  async onCreateCreatureTemplate(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { fields: Record<string, unknown> },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const fields = payload?.fields;
    if (!fields || typeof fields !== 'object') return { success: false, message: 'Payload invalide : fields requis.' };

    const numericFields = ['baseHealth', 'baseAttack', 'baseArmor', 'aggroRadius', 'fleeThresholdPct', 'patrolRadius', 'speedMin', 'speedMax', 'respawnDelayMs'];
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (numericFields.includes(k)) {
        safe[k] = Number(v);
      } else {
        safe[k] = v != null ? String(v) : '';
      }
    }

    let tpl: import('../creatures/entities/creature-template.entity').CreatureTemplate;
    try {
      tpl = await this.adminService.createCreatureTemplate(safe as any);
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la création.' };
    }
    return { success: true, message: `Créature "${tpl.key}" créée.`, data: tpl };
  }

  @SubscribeMessage('admin:create_resource_template')
  async onCreateResourceTemplate(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { fields: Record<string, unknown> },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const fields = payload?.fields;
    if (!fields || typeof fields !== 'object') return { success: false, message: 'Payload invalide : fields requis.' };

    const numericFields = ['defaultRemainingLoots', 'respawnDelayMs', 'gatheringXpReward'];
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (numericFields.includes(k)) {
        safe[k] = Number(v);
      } else if (k === 'skillKey') {
        safe[k] = v === '' ? null : (v != null ? String(v) : null);
      } else {
        safe[k] = v != null ? String(v) : '';
      }
    }

    let tpl: import('../resources/entities/resource-template.entity').ResourceTemplate;
    try {
      tpl = await this.adminService.createResourceTemplate(safe as any);
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la création.' };
    }
    return { success: true, message: `Template ressource "${tpl.type}" créé.`, data: tpl };
  }

  @SubscribeMessage('admin:create_skill_definition')
  async onCreateSkillDefinition(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: SkillDefinitionCreatePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const fields = payload?.fields;
    if (!fields || typeof fields !== 'object') {
      return { success: false, message: 'Payload invalide : fields requis.' };
    }

    const { key, name, category, maxLevel, baseXpPerLevel, xpCurveExponent, enabled } = fields as Record<string, unknown>;

    let sd: import('../skills/entities/skill-definition.entity').SkillDefinition;
    try {
      sd = await this.adminService.createSkillDefinition({
        key:   typeof key  === 'string' ? key  : '',
        name:  typeof name === 'string' ? name : '',
        ...(category         !== undefined && { category: String(category) }),
        ...(maxLevel         !== undefined && { maxLevel: Number(maxLevel) }),
        ...(baseXpPerLevel   !== undefined && { baseXpPerLevel: Number(baseXpPerLevel) }),
        ...(xpCurveExponent  !== undefined && { xpCurveExponent: Number(xpCurveExponent) }),
        ...(enabled          !== undefined && { enabled: enabled === true || enabled === 'true' }),
      });
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la création.' };
    }

    return { success: true, message: `Skill "${sd.key}" créé.`, data: sd };
  }

  @SubscribeMessage('admin:update_skill_definition')
  async onUpdateSkillDefinition(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: SkillDefinitionUpdatePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const ALLOWED = ['name', 'category', 'maxLevel', 'baseXpPerLevel', 'xpCurveExponent', 'enabled'];
    const safe: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(fields)) {
      if (!ALLOWED.includes(k)) return { success: false, message: `Champ "${k}" non modifiable.` };
      if (k === 'name' || k === 'category') {
        safe[k] = String(v);
      } else if (k === 'enabled') {
        safe[k] = v === true || v === 'true';
      } else {
        const n = Number(v);
        if (isNaN(n)) return { success: false, message: `Valeur invalide pour "${k}".` };
        safe[k] = n;
      }
    }

    let updated: import('../skills/entities/skill-definition.entity').SkillDefinition | null;
    try {
      updated = await this.adminService.updateSkillDefinition(id, safe as any);
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la mise à jour.' };
    }
    if (!updated) return { success: false, message: `Skill "${id}" introuvable.` };

    const changes = Object.keys(safe).join(', ');
    return { success: true, message: `Skill "${updated.key}" mis à jour : ${changes}.`, data: updated };
  }

  @SubscribeMessage('admin:update_resource')
  async onUpdateResource(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: UpdateEntityPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const numericAllowed = ['worldX', 'worldY', 'remainingLoots', 'respawnDelayMs'];
    const validResourceStates = ['alive', 'dead'];
    const safe: Record<string, number | string | null> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'state') {
        if (!validResourceStates.includes(String(v))) return { success: false, message: `État invalide : "${v}". Valeurs : ${validResourceStates.join(', ')}.` };
        safe[k] = String(v);
      } else if (k === 'respawnDelayMs') {
        const n = Number(v);
        if (isNaN(n) || n < 0) return { success: false, message: 'Valeur invalide pour "respawnDelayMs" : doit être >= 0 (0 = hérite du template).' };
        if (n > 0 && n > 86_400_000) return { success: false, message: 'respawnDelayMs doit être <= 86 400 000 ms (24h).' };
        safe[k] = n === 0 ? null : n;
      } else if (numericAllowed.includes(k)) {
        const n = Number(v);
        if (isNaN(n)) return { success: false, message: `Valeur invalide pour "${k}".` };
        safe[k] = n;
      } else {
        return { success: false, message: `Champ "${k}" non modifiable.` };
      }
    }

    const updated = await this.adminService.updateResource(id, safe as any);
    if (!updated) return { success: false, message: `Ressource "${id}" introuvable.` };

    this.server.to(getMapRoomId(updated.mapId ?? DEFAULT_MAP_ID)).emit('resource_update', this.resourcesService.buildResourceBroadcast(updated));

    const changes = Object.entries(safe).map(([k, v]) => `${k}→${v}`).join(', ');
    return { success: true, message: `Ressource "${updated.type}" mis à jour : ${changes}.`, data: updated };
  }

  // ── CraftingRecipes ──────────────────────────────────────────────────────

  @SubscribeMessage('admin:create_crafting_recipe')
  async onCreateCraftingRecipe(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { fields: Record<string, unknown> },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const fields = payload?.fields;
    if (!fields || typeof fields !== 'object') return { success: false, message: 'Payload invalide : fields requis.' };

    const numericFields = ['requiredSkillLevel', 'baseSuccessRate', 'successBonusPerLevel', 'minSuccessRate', 'maxSuccessRate', 'xpReward', 'craftTimeMs'];
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (numericFields.includes(k)) {
        safe[k] = Number(v);
      } else if (k === 'enabled' || k === 'consumeIngredientsOnFailure') {
        safe[k] = v === true || v === 'true';
      } else {
        safe[k] = v != null ? String(v) : null;
      }
    }

    let recipe: import('../crafting/entities/crafting-recipe.entity').CraftingRecipe;
    try {
      recipe = await this.adminService.createCraftingRecipe(safe as any);
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la création.' };
    }
    return { success: true, message: `Recette "${recipe.key}" créée.`, data: recipe };
  }

  @SubscribeMessage('admin:update_crafting_recipe')
  async onUpdateCraftingRecipe(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { id: string; fields: Record<string, unknown> },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const ALLOWED = ['name', 'description', 'category', 'requiredSkillKey', 'requiredSkillLevel',
      'baseSuccessRate', 'successBonusPerLevel', 'minSuccessRate', 'maxSuccessRate',
      'xpReward', 'consumeIngredientsOnFailure', 'craftTimeMs', 'stationType', 'enabled'];
    const numericFields = ['requiredSkillLevel', 'baseSuccessRate', 'successBonusPerLevel', 'minSuccessRate', 'maxSuccessRate', 'xpReward', 'craftTimeMs'];
    const safe: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(fields)) {
      if (!ALLOWED.includes(k)) return { success: false, message: `Champ "${k}" non modifiable.` };
      if (numericFields.includes(k)) {
        safe[k] = Number(v);
      } else if (k === 'enabled' || k === 'consumeIngredientsOnFailure') {
        safe[k] = v === true || v === 'true';
      } else {
        safe[k] = v != null ? String(v) : null;
      }
    }

    let updated: import('../crafting/entities/crafting-recipe.entity').CraftingRecipe | null;
    try {
      updated = await this.adminService.updateCraftingRecipe(id, safe as any);
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la mise à jour.' };
    }
    if (!updated) return { success: false, message: `Recette "${id}" introuvable.` };

    return { success: true, message: `Recette "${updated.key}" mise à jour.`, data: updated };
  }

  @SubscribeMessage('admin:add_ingredient')
  async onAddIngredient(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { recipeId: string; itemId: string; requiredQuantity: number },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { recipeId, itemId, requiredQuantity } = payload ?? {};
    if (!recipeId || !itemId) return { success: false, message: 'Payload invalide : recipeId et itemId requis.' };

    let ing: import('../crafting/entities/crafting-ingredient.entity').CraftingIngredient;
    try {
      ing = await this.adminService.addIngredient(recipeId, itemId, Number(requiredQuantity) || 1);
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur.' };
    }
    return { success: true, message: `Ingrédient ajouté (item: ${ing.itemId}, qty: ${ing.requiredQuantity}).`, data: ing };
  }

  @SubscribeMessage('admin:remove_ingredient')
  async onRemoveIngredient(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { ingredientId: string },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { ingredientId } = payload ?? {};
    if (!ingredientId) return { success: false, message: 'Payload invalide : ingredientId requis.' };

    const removed = await this.adminService.removeIngredient(ingredientId);
    if (!removed) return { success: false, message: `Ingrédient "${ingredientId}" introuvable.` };
    return { success: true, message: `Ingrédient supprimé.`, data: removed };
  }

  @SubscribeMessage('admin:add_result')
  async onAddResult(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { recipeId: string; itemId: string; producedQuantity: number; chance: number },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { recipeId, itemId, producedQuantity, chance } = payload ?? {};
    if (!recipeId || !itemId) return { success: false, message: 'Payload invalide : recipeId et itemId requis.' };

    let res: import('../crafting/entities/crafting-result.entity').CraftingResult;
    try {
      res = await this.adminService.addResult(recipeId, itemId, Number(producedQuantity) || 1, Number(chance) ?? 1);
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur.' };
    }
    return { success: true, message: `Résultat ajouté (item: ${res.itemId}, qty: ${res.producedQuantity}, chance: ${res.chance}).`, data: res };
  }

  @SubscribeMessage('admin:remove_result')
  async onRemoveResult(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { resultId: string },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { resultId } = payload ?? {};
    if (!resultId) return { success: false, message: 'Payload invalide : resultId requis.' };

    const removed = await this.adminService.removeResult(resultId);
    if (!removed) return { success: false, message: `Résultat "${resultId}" introuvable.` };
    return { success: true, message: `Résultat supprimé.`, data: removed };
  }

  @SubscribeMessage('admin:validate_crafting_recipe')
  async onValidateCraftingRecipe(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { recipeId: string },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { recipeId } = payload ?? {};
    if (!recipeId) return { success: false, message: 'Payload invalide : recipeId requis.' };

    const result = await this.adminService.validateCraftingRecipe(recipeId);
    const summary = result.valid
      ? `Recette valide${result.warnings.length ? ` (${result.warnings.length} avertissement(s))` : ''}.`
      : `Recette invalide : ${result.errors.join('; ')}`;
    return { success: result.valid, message: summary, data: result };
  }

  // ── CraftingStations ─────────────────────────────────────────────────────

  @SubscribeMessage('admin:create_crafting_station_template')
  async onCreateCraftingStationTemplate(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: CraftingStationTemplateCreatePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const fields = payload?.fields;
    if (!fields || typeof fields !== 'object') return { success: false, message: 'Payload invalide : fields requis.' };

    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'interactionRadiusWU') safe[k] = Number(v);
      else if (k === 'enabled') safe[k] = v === true || v === 'true';
      else safe[k] = v == null || v === '' ? null : String(v);
    }

    try {
      const template = await this.adminService.createCraftingStationTemplate(safe as any);
      return { success: true, message: `Station template "${template.key}" créé.`, data: template };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la création.' };
    }
  }

  @SubscribeMessage('admin:update_crafting_station_template')
  async onUpdateCraftingStationTemplate(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: CraftingStationTemplateUpdatePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const allowed = ['name', 'stationType', 'category', 'requiredSkillKey', 'interactionRadiusWU', 'enabled'];
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!allowed.includes(k)) return { success: false, message: `Champ "${k}" non modifiable.` };
      if (k === 'interactionRadiusWU') safe[k] = Number(v);
      else if (k === 'enabled') safe[k] = v === true || v === 'true';
      else safe[k] = v == null || v === '' ? null : String(v);
    }

    try {
      const updated = await this.adminService.updateCraftingStationTemplate(id, safe as any);
      if (!updated) return { success: false, message: `Station template "${id}" introuvable.` };
      return { success: true, message: `Station template "${updated.key}" mis à jour.`, data: updated };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la mise à jour.' };
    }
  }

  @SubscribeMessage('admin:create_crafting_station')
  async onCreateCraftingStation(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { templateId: string; worldX: number; worldY: number; mapId?: number },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { templateId, worldX, worldY, mapId } = payload ?? {};
    if (!templateId || typeof worldX !== 'number' || typeof worldY !== 'number') {
      return { success: false, message: 'Payload invalide : templateId, worldX, worldY requis.' };
    }

    try {
      const station = await this.adminService.createCraftingStation(templateId, worldX, worldY, mapId);
      this.server.emit('crafting_station_update', station);
      return {
        success: true,
        message: `Station "${station.template?.key ?? station.templateId}" créée en WU (${Math.round(worldX)}, ${Math.round(worldY)}). ID: ${station.id}`,
        data: station,
      };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la création.' };
    }
  }

  @SubscribeMessage('admin:update_crafting_station')
  async onUpdateCraftingStation(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { id: string; fields: Record<string, unknown> },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const allowed = ['worldX', 'worldY', 'mapId', 'enabled'];
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!allowed.includes(k)) return { success: false, message: `Champ "${k}" non modifiable.` };
      if (k === 'enabled') safe[k] = v === true || v === 'true';
      else safe[k] = Number(v);
    }

    try {
      const updated = await this.adminService.updateCraftingStation(id, safe as any);
      if (!updated) return { success: false, message: `Station "${id}" introuvable.` };
      this.server.emit('crafting_station_update', updated);
      return { success: true, message: `Station "${updated.template?.key ?? updated.templateId}" mise à jour.`, data: updated };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la mise à jour.' };
    }
  }

  @SubscribeMessage('admin:delete_crafting_station')
  async onDeleteCraftingStation(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { id: string },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id } = payload ?? {};
    if (!id) return { success: false, message: 'Payload invalide : id requis.' };

    const deleted = await this.adminService.deleteCraftingStation(id);
    if (!deleted) return { success: false, message: `Station "${id}" introuvable.` };
    this.server.emit('crafting_station_update', { id: deleted.id, deleted: true });
    return { success: true, message: `Station "${deleted.template?.key ?? deleted.templateId}" supprimée.`, data: deleted };
  }

  // ── Buildings ─────────────────────────────────────────────────────────────

  @SubscribeMessage('admin:create_building_template')
  async onCreateBuildingTemplate(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: BuildingTemplateCreatePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };
    const fields = payload?.fields ?? {};
    try {
      const template = await this.buildingsService.createTemplate(fields as any);
      return { success: true, message: `Template building "${template.key}" créé.`, data: template };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la création.' };
    }
  }

  @SubscribeMessage('admin:update_building_template')
  async onUpdateBuildingTemplate(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: BuildingTemplateUpdatePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };
    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const allowed = ['name', 'textureKey', 'interactionRadiusWU', 'enabled'];
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!allowed.includes(k)) return { success: false, message: `Champ "${k}" non modifiable.` };
      if (k === 'enabled') safe[k] = v === true || v === 'true';
      else if (k === 'interactionRadiusWU') safe[k] = Number(v);
      else safe[k] = v;
    }

    try {
      const updated = await this.buildingsService.updateTemplate(id, safe as any);
      return { success: true, message: `Template building "${updated.key}" mis à jour.`, data: updated };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la mise à jour.' };
    }
  }

  @SubscribeMessage('admin:create_building')
  async onCreateBuilding(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: BuildingCreatePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };
    const { templateId, worldX, worldY, mapId } = payload ?? {};
    if (!templateId || worldX == null || worldY == null) {
      return { success: false, message: 'Payload invalide : templateId, worldX, worldY requis.' };
    }

    try {
      const building = await this.buildingsService.createBuilding(templateId, worldX, worldY, mapId);
      const wom = toBuildingWorldObject(building);
      this.server.to(getMapRoomId(building.mapId)).emit('building_update', wom);
      return { success: true, message: `Building créé.`, data: wom };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la création.' };
    }
  }

  @SubscribeMessage('admin:update_building')
  async onUpdateBuilding(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: BuildingUpdatePayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };
    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const allowed = ['worldX', 'worldY', 'mapId', 'state'];
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!allowed.includes(k)) return { success: false, message: `Champ "${k}" non modifiable.` };
      if (k === 'state') safe[k] = v;
      else safe[k] = Number(v);
    }

    try {
      const updated = await this.buildingsService.updateBuilding(id, safe as any);
      const wom = toBuildingWorldObject(updated);
      this.server.to(getMapRoomId(updated.mapId)).emit('building_update', wom);
      return { success: true, message: `Building mis à jour.`, data: wom };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la mise à jour.' };
    }
  }

  @SubscribeMessage('admin:delete_building')
  async onDeleteBuilding(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { id: string },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };
    const { id } = payload ?? {};
    if (!id) return { success: false, message: 'Payload invalide : id requis.' };

    try {
      const deleted = await this.buildingsService.deleteBuilding(id);
      this.server.to(getMapRoomId(deleted.mapId)).emit('building_update', { id: deleted.id, deleted: true });
      return { success: true, message: `Building supprimé.`, data: { id: deleted.id } };
    } catch (err: any) {
      return { success: false, message: err?.message ?? 'Erreur lors de la suppression.' };
    }
  }
}
