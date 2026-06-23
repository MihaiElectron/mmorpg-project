import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import type { WorldSocket } from '../types/world-socket';
import { AnimalsService } from '../animals/animals.service';
import { WorldService } from '../world/world.service';
import { AdminService } from './admin.service';
import { CLIENT_ORIGIN } from '../common/cors.constants';

type SpawnPayload = { templateKey: string; x: number; y: number };
type TeleportPayload = { characterId: string; x: number; y: number };
type UpdateTemplatePayload = { key: string; fields: Record<string, number> };
type RespawnAllPayload = { templateKey: string };
type MoveAnimalPayload = { animalId: string; x: number; y: number };
type UpdateEntityPayload = { id: string; fields: Record<string, number> };

type CmdResult = { success: boolean; message: string; data?: unknown };

@WebSocketGateway({ cors: { origin: CLIENT_ORIGIN } })
export class AdminGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly animalsService: AnimalsService,
    private readonly worldService: WorldService,
    private readonly adminService: AdminService,
  ) {}

  @SubscribeMessage('admin:spawn')
  async onSpawn(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: SpawnPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') {
      return { success: false, message: 'Non autorisé.' };
    }

    const { templateKey, x, y } = payload ?? {};
    if (!templateKey || typeof x !== 'number' || typeof y !== 'number') {
      return { success: false, message: 'Payload invalide : templateKey, x, y requis.' };
    }

    const dto = await this.animalsService.createAdminSpawn(templateKey, x, y);
    if (!dto) {
      return { success: false, message: `Template "${templateKey}" introuvable.` };
    }

    this.server.emit('animal_update', dto);
    return {
      success: true,
      message: `"${dto.name}" spawné en (${Math.round(x)}, ${Math.round(y)}). ID: ${dto.id}`,
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

    const { characterId: rawId, x, y } = payload ?? {};
    if (!rawId || typeof x !== 'number' || typeof y !== 'number') {
      return { success: false, message: 'Payload invalide : characterId, x, y requis.' };
    }

    const resolved = this.worldService.findPlayerByNameOrId(rawId);
    if (!resolved) {
      return { success: false, message: `Joueur "${rawId}" introuvable ou non connecté.` };
    }

    const player = await this.worldService.teleportCharacter(resolved.characterId, x, y, this.server);
    if (!player) {
      return { success: false, message: `Joueur "${rawId}" introuvable ou non connecté.` };
    }

    return {
      success: true,
      message: `"${player.name}" (${player.characterId}) téléporté en (${Math.round(x)}, ${Math.round(y)}).`,
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

    // Valider que les champs sont des nombres
    const allowedFields = ['baseHealth', 'aggroRadius', 'baseAttack', 'baseArmor', 'fleeThresholdPct', 'patrolRadius'];
    const safeFields: Record<string, number> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!allowedFields.includes(k)) {
        return { success: false, message: `Champ "${k}" non modifiable.` };
      }
      const n = Number(v);
      if (isNaN(n) || n < 0) {
        return { success: false, message: `Valeur invalide pour "${k}" : doit être >= 0.` };
      }
      safeFields[k] = n;
    }

    // Lire les valeurs actuelles pour le message avant/après
    const templates = await this.adminService.getTemplates();
    const current = templates.find((t) => t.key === key);
    if (!current) {
      return { success: false, message: `Template "${key}" introuvable.` };
    }

    const beforeValues: Record<string, number> = {};
    for (const k of Object.keys(safeFields)) {
      beforeValues[k] = (current as any)[k];
    }

    const updated = await this.adminService.updateTemplate(key, safeFields);
    if (!updated) {
      return { success: false, message: `Échec de la mise à jour du template "${key}".` };
    }

    const changes = Object.entries(safeFields)
      .map(([k, v]) => `${k} ${beforeValues[k]}→${v}`)
      .join(', ');

    this.animalsService.refreshTemplateInMemory(key, safeFields);
    this.server.emit('category:updated', updated);
    return {
      success: true,
      message: `Template "${updated.name}" mis à jour : ${changes}.`,
      data: updated,
    };
  }

  @SubscribeMessage('admin:move_animal')
  async onMoveAnimal(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: MoveAnimalPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') {
      return { success: false, message: 'Non autorisé.' };
    }

    const { animalId, x, y } = payload ?? {};
    if (!animalId || typeof x !== 'number' || typeof y !== 'number') {
      return { success: false, message: 'Payload invalide : animalId, x, y requis.' };
    }

    const dto = await this.animalsService.moveAnimal(animalId, x, y);
    if (!dto) {
      return { success: false, message: `Animal "${animalId}" introuvable ou mort.` };
    }

    return {
      success: true,
      message: `"${dto.name}" (${dto.id}) déplacé en (${Math.round(x)}, ${Math.round(y)}).`,
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

    const count = await this.animalsService.forceRespawnAll(templateKey);
    return {
      success: count > 0,
      message: count > 0
        ? `${count} "${templateKey}" réinitialisé(s) à leur position de spawn (state: alive, HP max).`
        : `Aucun animal "${templateKey}" trouvé en mémoire.`,
    };
  }

  @SubscribeMessage('admin:update_animal')
  async onUpdateAnimal(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: UpdateEntityPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const numericAllowed = ['health', 'x', 'y'];
    const validStates = ['alive', 'fighting', 'escaping', 'dead'];
    const safe: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'state') {
        if (!validStates.includes(String(v))) return { success: false, message: `État invalide : "${v}". Valeurs : ${validStates.join(', ')}.` };
        safe[k] = String(v);
      } else if (numericAllowed.includes(k)) {
        const n = Number(v);
        if (isNaN(n) || n < 0) return { success: false, message: `Valeur invalide pour "${k}".` };
        safe[k] = n;
      } else {
        return { success: false, message: `Champ "${k}" non modifiable.` };
      }
    }

    const dto = await this.animalsService.adminUpdateAnimal(id, safe as any);
    if (!dto) return { success: false, message: `Animal "${id}" introuvable ou mort.` };

    const changes = Object.entries(safe).map(([k, v]) => `${k}→${v}`).join(', ');
    return { success: true, message: `"${dto.name}" (${dto.id}) mis à jour : ${changes}.`, data: dto };
  }

  @SubscribeMessage('admin:update_resource_template')
  async onUpdateResourceTemplate(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { type: string; fields: Record<string, number> },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { type, fields } = payload ?? {};
    if (!type || !fields) return { success: false, message: 'Payload invalide : type et fields requis.' };

    const allowed = ['defaultRemainingLoots', 'respawnDelayMs'];
    const safe: Record<string, number> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!allowed.includes(k)) return { success: false, message: `Champ "${k}" non modifiable.` };
      const n = Number(v);
      if (isNaN(n) || n <= 0) return { success: false, message: `Valeur invalide pour "${k}" (doit être > 0).` };
      safe[k] = n;
    }

    const updated = await this.adminService.updateResourceTemplate(type, safe as any);
    if (!updated) return { success: false, message: `Template ressource "${type}" introuvable.` };

    const parts: string[] = [];
    if (safe.defaultRemainingLoots !== undefined) parts.push(`loots défaut → ${updated.defaultRemainingLoots}`);
    if (safe.respawnDelayMs        !== undefined) parts.push(`respawn → ${updated.respawnDelayMs} ms`);
    return { success: true, message: `Template "${type}" mis à jour : ${parts.join(', ')}.`, data: updated };
  }

  @SubscribeMessage('admin:spawn_resource')
  async onSpawnResource(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { type: string; x: number; y: number },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { type, x, y } = payload ?? {};
    if (!type || typeof x !== 'number' || typeof y !== 'number')
      return { success: false, message: 'Payload invalide : type, x, y requis.' };

    const resource = await this.adminService.createResource(type, x, y);
    this.server.emit('resource_update', {
      id: resource.id,
      type: resource.type,
      x: resource.x,
      y: resource.y,
      state: resource.state,
      remainingLoots: resource.remainingLoots,
    });
    return {
      success: true,
      message: `Ressource "${type}" créée en (${Math.round(x)}, ${Math.round(y)}). ID: ${resource.id}`,
    };
  }

  @SubscribeMessage('admin:delete_animal')
  async onDeleteAnimal(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: { id: string },
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id } = payload ?? {};
    if (!id) return { success: false, message: 'Payload invalide : id requis.' };

    const dto = await this.animalsService.adminDeleteAnimal(id);
    if (!dto) return { success: false, message: `Animal "${id}" introuvable en mémoire.` };

    this.server.emit('animal_update', { ...dto, state: 'dead' });
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

    this.server.emit('resource_update', { id: deleted.id, state: 'dead', deleted: true });
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

    const changes = Object.entries(safe).map(([k, v]) => `${k}→${v}`).join(', ');
    return { success: true, message: `"${updated.name}" mis à jour : ${changes}.`, data: updated };
  }

  @SubscribeMessage('admin:update_resource')
  async onUpdateResource(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: UpdateEntityPayload,
  ): Promise<CmdResult> {
    if (client.data.role !== 'admin') return { success: false, message: 'Non autorisé.' };

    const { id, fields } = payload ?? {};
    if (!id || !fields) return { success: false, message: 'Payload invalide : id et fields requis.' };

    const numericAllowed = ['x', 'y', 'remainingLoots'];
    const validResourceStates = ['alive', 'dead'];
    const safe: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'state') {
        if (!validResourceStates.includes(String(v))) return { success: false, message: `État invalide : "${v}". Valeurs : ${validResourceStates.join(', ')}.` };
        safe[k] = String(v);
      } else if (numericAllowed.includes(k)) {
        const n = Number(v);
        if (isNaN(n) || n < 0) return { success: false, message: `Valeur invalide pour "${k}".` };
        safe[k] = n;
      } else {
        return { success: false, message: `Champ "${k}" non modifiable.` };
      }
    }

    const updated = await this.adminService.updateResource(id, safe as any);
    if (!updated) return { success: false, message: `Ressource "${id}" introuvable.` };

    this.server.emit('resource_update', {
      id: updated.id,
      type: updated.type,
      x: updated.x,
      y: updated.y,
      state: updated.state,
      remainingLoots: updated.remainingLoots,
    });

    const changes = Object.entries(safe).map(([k, v]) => `${k}→${v}`).join(', ');
    return { success: true, message: `Ressource "${updated.type}" mis à jour : ${changes}.`, data: updated };
  }
}
