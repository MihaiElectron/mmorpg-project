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
import { ResourcesService } from '../resources/resources.service';
import { CLIENT_ORIGIN } from '../common/cors.constants';

type SpawnPayload = { templateKey: string; worldX: number; worldY: number };
type TeleportPayload = { characterId: string; worldX: number; worldY: number };
type UpdateTemplatePayload = { key: string; fields: Record<string, number> };
type RespawnAllPayload = { templateKey: string };
type MoveAnimalPayload = { animalId: string; worldX: number; worldY: number };
type UpdateEntityPayload = { id: string; fields: Record<string, number> };
type SkillDefinitionCreatePayload = { fields: Record<string, unknown> };
type SkillDefinitionUpdatePayload = { id: string; fields: Record<string, unknown> };
type CraftingStationTemplateCreatePayload = { fields: Record<string, unknown> };
type CraftingStationTemplateUpdatePayload = { id: string; fields: Record<string, unknown> };

type CmdResult = { success: boolean; message: string; data?: unknown };

@WebSocketGateway({ cors: { origin: CLIENT_ORIGIN } })
export class AdminGateway {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly animalsService: AnimalsService,
    private readonly worldService: WorldService,
    private readonly adminService: AdminService,
    private readonly resourcesService: ResourcesService,
  ) {}

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

    const dto = await this.animalsService.createAdminSpawn(templateKey, worldX, worldY);
    if (!dto) {
      return { success: false, message: `Template "${templateKey}" introuvable.` };
    }

    this.server.emit('animal_update', dto);
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

    const { characterId: rawId, worldX, worldY } = payload ?? {};
    if (!rawId || typeof worldX !== 'number' || typeof worldY !== 'number') {
      return { success: false, message: 'Payload invalide : characterId, worldX, worldY requis.' };
    }

    const resolved = this.worldService.findPlayerByNameOrId(rawId);
    if (!resolved) {
      return { success: false, message: `Joueur "${rawId}" introuvable ou non connecté.` };
    }

    const player = await this.worldService.teleportCharacter(resolved.characterId, worldX, worldY, this.server);
    if (!player) {
      return { success: false, message: `Joueur "${rawId}" introuvable ou non connecté.` };
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

    const numericAllowed = ['baseHealth', 'aggroRadius', 'baseAttack', 'baseArmor', 'fleeThresholdPct', 'patrolRadius', 'respawnDelayMs'];
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

    this.animalsService.refreshTemplateInMemory(key, safeFields as any);
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

    const { animalId, worldX, worldY } = payload ?? {};
    if (!animalId || typeof worldX !== 'number' || typeof worldY !== 'number') {
      return { success: false, message: 'Payload invalide : animalId, worldX, worldY requis.' };
    }

    const dto = await this.animalsService.moveAnimal(animalId, worldX, worldY);
    if (!dto) {
      return { success: false, message: `Animal "${animalId}" introuvable ou mort.` };
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

    const dto = await this.animalsService.adminUpdateAnimal(id, safe as any);
    if (!dto) return { success: false, message: `Animal "${id}" introuvable ou mort.` };

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
    this.server.emit('resource_update', this.resourcesService.buildResourceBroadcast(resource));
    return {
      success: true,
      message: `Ressource "${type}" créée en WU (${Math.round(worldX)}, ${Math.round(worldY)}). ID: ${resource.id}`,
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

    let tpl: import('../animals/entities/creature-template.entity').CreatureTemplate;
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

    this.server.emit('resource_update', this.resourcesService.buildResourceBroadcast(updated));

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
}
