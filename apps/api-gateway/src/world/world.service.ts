// apps/api-gateway/src/world/world.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { WorldSocket } from '../types/world-socket';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from 'socket.io';
import { Character } from '../characters/entities/character.entity';
import { RespawnPoint } from './entities/respawn-point.entity';
import { readWorldPosition } from '../common/world-position.adapter';
import {
  wuToIsoScreenX,
  wuToIsoScreenY,
  isoScreenToWorldWU,
  chebyshevDistanceWU,
  DEFAULT_MAP_ID,
} from '../common/world-coordinates';

export type ConnectedPlayer = {
  socketId: string;
  characterId: string;
  name: string;
  sex?: string;
  // ── Vérité serveur — coordonnées WU ──────────────────────────────────────
  worldX: number;
  worldY: number;
  mapId: number;
  // ── Cache de rendu — pixels Phaser, destinés uniquement au frontend ───────
  x: number;
  y: number;
  // ─────────────────────────────────────────────────────────────────────────
  direction?: string;
};

export type JoinWorldPayload = {
  characterId: string;
  name: string;
  sex?: string;
  direction?: string;
};

export type JoinedPlayer = {
  player: ConnectedPlayer;
  previousSocketId: string | null;
};

@Injectable()
export class WorldService implements OnModuleInit {
  private connectedPlayers = new Map<string, ConnectedPlayer>();

  constructor(
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
    @InjectRepository(RespawnPoint)
    private readonly respawnPointRepository: Repository<RespawnPoint>,
  ) {}

  async onModuleInit() {
    // Remettre les personnages morts à plein de vie au redémarrage
    const deadChars = await this.characterRepository.find({ where: { health: 0 } });
    for (const char of deadChars) {
      await this.characterRepository.update(char.id, { health: char.maxHealth });
    }

    const count = await this.respawnPointRepository.count();
    if (count === 0) {
      await this.respawnPointRepository.save(
        this.respawnPointRepository.create({ x: 600, y: 300, radius: 20 }),
      );
    }
  }

  async respawnCharacter(characterId: string, server: Server): Promise<void> {
    const character = await this.characterRepository.findOne({ where: { id: characterId } });
    if (!character) return;

    const points = await this.respawnPointRepository.find();
    if (points.length === 0) return;

    // Position WU du personnage (fallback vers les pixels legacy si non backfillé)
    let charWU: { worldX: number; worldY: number; mapId: number };
    try {
      charWU = readWorldPosition(character, (c) => ({
        x: (c as unknown as Character).positionX,
        y: (c as unknown as Character).positionY,
      }));
    } catch {
      charWU = { worldX: 0, worldY: 0, mapId: DEFAULT_MAP_ID };
    }

    // Trouver le respawn point le plus proche sur la même map, en distance Chebyshev WU
    let nearest = points[0];
    let nearestWU: { worldX: number; worldY: number; mapId: number } | null = null;
    let minDist = Infinity;

    for (const p of points) {
      let pWU: { worldX: number; worldY: number; mapId: number };
      try {
        pWU = readWorldPosition(p, (rp) => ({
          x: (rp as unknown as RespawnPoint).x,
          y: (rp as unknown as RespawnPoint).y,
        }));
      } catch { continue; }
      if (pWU.mapId !== charWU.mapId) continue;
      const d = chebyshevDistanceWU(charWU, pWU);
      if (d < minDist) { minDist = d; nearest = p; nearestWU = pWU; }
    }

    // Fallback : aucun point sur la même map → premier point valide disponible
    if (nearestWU === null) {
      for (const p of points) {
        try {
          nearestWU = readWorldPosition(p, (rp) => ({
            x: (rp as unknown as RespawnPoint).x,
            y: (rp as unknown as RespawnPoint).y,
          }));
          nearest = p;
          break;
        } catch { continue; }
      }
    }
    if (nearestWU === null) return;

    // Position de respawn : base WU officielle du point, offset aléatoire en pixels
    const baseX = Math.round(wuToIsoScreenX(nearestWU.worldX, nearestWU.worldY));
    const baseY = Math.round(wuToIsoScreenY(nearestWU.worldX, nearestWU.worldY));
    const angle = Math.random() * Math.PI * 2;
    const drift = Math.random() * nearest.radius;
    const newX = Math.round(baseX + Math.cos(angle) * drift);
    const newY = Math.round(baseY + Math.sin(angle) * drift);

    // Convertir la position finale en WU pour la vérité serveur
    let newWX = nearestWU.worldX;
    let newWY = nearestWU.worldY;
    try {
      const wu = isoScreenToWorldWU(newX, newY);
      newWX = wu.worldX;
      newWY = wu.worldY;
    } catch { /* position hors isométrie : conserver la WU du point */ }

    const newHealth = character.maxHealth;

    await this.characterRepository.update(characterId, {
      health: newHealth,
      positionX: newX,
      positionY: newY,
      worldX: newWX,
      worldY: newWY,
      mapId: nearestWU.mapId,
    });

    // Mettre à jour la position en mémoire et notifier le joueur
    for (const player of this.connectedPlayers.values()) {
      if (player.characterId === characterId) {
        player.x       = newX;
        player.y       = newY;
        player.worldX  = newWX;
        player.worldY  = newWY;
        player.mapId   = nearestWU.mapId;
        server.to(player.socketId).emit('character_respawn', {
          characterId,
          x: newX,
          y: newY,
          health: newHealth,
          maxHealth: character.maxHealth,
        });
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Synchronisation temps réel des joueurs
  // ---------------------------------------------------------------------------
  async joinPlayer(
    client: WorldSocket,
    payload: JoinWorldPayload,
  ): Promise<JoinedPlayer | null> {
    const previousSocketId = this.findSocketIdByCharacterId(
      payload.characterId,
      client.id,
    );

    if (previousSocketId) {
      const previousPlayer = this.connectedPlayers.get(previousSocketId);
      if (previousPlayer) {
        await this.persistPlayerPosition(previousPlayer);
      }

      this.connectedPlayers.delete(previousSocketId);
    }

    const character = await this.characterRepository.findOne({
      where: { id: payload.characterId },
    });
    if (!character) return null;

    // Le personnage doit appartenir à l'utilisateur authentifié sur ce socket.
    if (character.userId !== client.data.userId) return null;

    // Lire la position officielle WU (priorité) ou fallback legacy pixels.
    // Conversion WU → pixels Phaser pour alimenter le cache de rendu uniquement.
    let playerWX = 0;
    let playerWY = 0;
    let playerMapId = DEFAULT_MAP_ID;
    let playerX: number;
    let playerY: number;
    try {
      const wuPos = readWorldPosition(character, (c) => ({
        x: (c as unknown as Character).positionX,
        y: (c as unknown as Character).positionY,
      }));
      playerWX    = wuPos.worldX;
      playerWY    = wuPos.worldY;
      playerMapId = wuPos.mapId;
      playerX = Math.round(wuToIsoScreenX(playerWX, playerWY));
      playerY = Math.round(wuToIsoScreenY(playerWX, playerWY));
    } catch {
      // Entité sans coordonnées WU valides : fallback serveur contrôlé, worldX/Y restent à zéro
      playerX = character.positionX ?? 400;
      playerY = character.positionY ?? 300;
    }

    const player: ConnectedPlayer = {
      socketId: client.id,
      characterId: payload.characterId,
      name: character.name,
      sex: character.sex,
      worldX: playerWX,
      worldY: playerWY,
      mapId: playerMapId,
      x: playerX,
      y: playerY,
      direction: payload.direction ?? 'down',
    };

    this.connectedPlayers.set(client.id, player);
    client.data.player = {
      characterId: player.characterId,
      name: player.name,
      sex: player.sex,
      worldX: player.worldX,
      worldY: player.worldY,
      mapId: player.mapId,
      x: player.x,
      y: player.y,
      direction: player.direction,
    };

    return { player, previousSocketId };
  }

  updatePlayer(
    client: WorldSocket,
    payload: { x: number; y: number; worldX?: number; worldY?: number; mapId?: number; direction?: string },
  ): ConnectedPlayer | null {
    const player = this.connectedPlayers.get(client.id);
    if (!player) return null;

    player.direction = payload.direction ?? player.direction;

    if (
      Number.isFinite(payload.worldX) &&
      Number.isFinite(payload.worldY) &&
      Number.isFinite(payload.mapId)
    ) {
      // Chemin WU direct — client transmet des coordonnées WU validées
      player.worldX = payload.worldX!;
      player.worldY = payload.worldY!;
      player.mapId  = payload.mapId!;
      player.x = Math.round(wuToIsoScreenX(payload.worldX!, payload.worldY!));
      player.y = Math.round(wuToIsoScreenY(payload.worldX!, payload.worldY!));
    } else if (Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
      // Fallback legacy — conversion pixel → WU (client sans support WU)
      try {
        const wu = isoScreenToWorldWU(payload.x, payload.y);
        player.worldX = wu.worldX;
        player.worldY = wu.worldY;
        // mapId reste inchangé dans ce chemin : le client ne le transmet pas
        player.x = payload.x;
        player.y = payload.y;
      } catch { /* position hors isométrie : worldX/Y et x/y conservent leur valeur précédente */ }
    }

    client.data.player = {
      characterId: player.characterId,
      name: player.name,
      sex: player.sex,
      worldX: player.worldX,
      worldY: player.worldY,
      mapId: player.mapId,
      x: player.x,
      y: player.y,
      direction: player.direction,
    };

    return player;
  }

  removePlayer(client: WorldSocket): ConnectedPlayer | undefined {
    const player = this.connectedPlayers.get(client.id);
    this.connectedPlayers.delete(client.id);
    return player;
  }

  async persistPlayerPosition(player: ConnectedPlayer): Promise<void> {
    // Résolution des coordonnées WU à persister
    let wuX    = player.worldX;
    let wuY    = player.worldY;
    let wuMap  = player.mapId;

    // Fallback défensif : si worldX/Y sont NaN/Infinity (ne devrait pas arriver),
    // recalculer depuis les pixels du cache de rendu
    if (!Number.isFinite(wuX) || !Number.isFinite(wuY)) {
      try {
        const wu = isoScreenToWorldWU(player.x, player.y);
        wuX   = wu.worldX;
        wuY   = wu.worldY;
      } catch {
        wuX   = 0;
        wuY   = 0;
      }
      wuMap = DEFAULT_MAP_ID;
    }

    // Double-écriture : pixels legacy + WU.
    // Les colonnes pixel (positionX/Y) restent jusqu'à suppression explicite des colonnes legacy.
    await this.characterRepository.update(player.characterId, {
      positionX: Math.round(player.x),
      positionY: Math.round(player.y),
      worldX: wuX,
      worldY: wuY,
      mapId: wuMap,
    });
  }

  getAllConnectedPlayers(): ConnectedPlayer[] {
    return Array.from(this.connectedPlayers.values());
  }

  getConnectedCount(): number {
    const unique = new Set(Array.from(this.connectedPlayers.values()).map((p) => p.characterId));
    return unique.size;
  }

  getPlayersExcept(socketId: string): ConnectedPlayer[] {
    const playersByCharacter = new Map<string, ConnectedPlayer>();

    for (const player of this.connectedPlayers.values()) {
      if (player.socketId !== socketId) {
        playersByCharacter.set(player.characterId, player);
      }
    }

    return Array.from(playersByCharacter.values());
  }

  getSocketIdByCharacterId(characterId: string): string | null {
    for (const player of this.connectedPlayers.values()) {
      if (player.characterId === characterId) return player.socketId;
    }
    return null;
  }

  findPlayerByNameOrId(nameOrId: string): ConnectedPlayer | null {
    const lower = nameOrId.toLowerCase();
    for (const player of this.connectedPlayers.values()) {
      if (player.characterId === nameOrId) return player;
    }
    for (const player of this.connectedPlayers.values()) {
      if (player.name.toLowerCase() === lower) return player;
    }
    return null;
  }

  async teleportCharacter(
    characterId: string,
    x: number,
    y: number,
    server: Server,
  ): Promise<ConnectedPlayer | null> {
    const rx = Math.round(x);
    const ry = Math.round(y);

    for (const player of this.connectedPlayers.values()) {
      if (player.characterId === characterId) {
        player.x = rx;
        player.y = ry;
        // Mettre à jour la vérité serveur WU depuis la position de téléportation
        let teleportWorldX = player.worldX;
        let teleportWorldY = player.worldY;
        const teleportMapId = player.mapId;
        try {
          const wu = isoScreenToWorldWU(rx, ry);
          if (Number.isFinite(wu.worldX) && Number.isFinite(wu.worldY)) {
            teleportWorldX = wu.worldX;
            teleportWorldY = wu.worldY;
          }
        } catch { /* position hors isométrie : worldX/Y conservent leur valeur précédente */ }

        const positionUpdate: Partial<Character> = { positionX: rx, positionY: ry };
        if (
          Number.isFinite(teleportWorldX) &&
          Number.isFinite(teleportWorldY) &&
          Number.isFinite(teleportMapId)
        ) {
          player.worldX = teleportWorldX;
          player.worldY = teleportWorldY;
          player.mapId = teleportMapId;
          positionUpdate.worldX = teleportWorldX;
          positionUpdate.worldY = teleportWorldY;
          positionUpdate.mapId = teleportMapId;
        }

        await this.characterRepository.update(characterId, positionUpdate);
        server.to(player.socketId).emit('character_teleport', { x: rx, y: ry });
        server.except(player.socketId).emit('player_moved', player);
        return player;
      }
    }

    return null;
  }

  private findSocketIdByCharacterId(
    characterId: string,
    exceptSocketId: string,
  ) {
    for (const player of this.connectedPlayers.values()) {
      if (
        player.characterId === characterId &&
        player.socketId !== exceptSocketId
      ) {
        return player.socketId;
      }
    }

    return null;
  }
}
