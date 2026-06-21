// apps/api-gateway/src/world/world.service.ts

import { Injectable, OnModuleInit } from '@nestjs/common';
import { WorldSocket } from '../types/world-socket';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from 'socket.io';
import { Character } from '../characters/entities/character.entity';
import { RespawnPoint } from './entities/respawn-point.entity';
import { readWorldPosition } from '../common/world-position.adapter';
import { wuToIsoScreenX, wuToIsoScreenY } from '../common/world-coordinates';

export type ConnectedPlayer = {
  socketId: string;
  characterId: string;
  name: string;
  sex?: string;
  x: number;
  y: number;
  direction?: string;
};

export type JoinWorldPayload = {
  characterId: string;
  name: string;
  sex?: string;
  x?: number;
  y?: number;
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

    // Trouver le point le plus proche de la position persistée du personnage
    let nearest = points[0];
    let minDist = Math.hypot(nearest.x - character.positionX, nearest.y - character.positionY);
    for (const p of points) {
      const d = Math.hypot(p.x - character.positionX, p.y - character.positionY);
      if (d < minDist) { minDist = d; nearest = p; }
    }

    // Position aléatoire dans le radius
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * nearest.radius;
    const newX = Math.round(nearest.x + Math.cos(angle) * dist);
    const newY = Math.round(nearest.y + Math.sin(angle) * dist);
    const newHealth = character.maxHealth;

    await this.characterRepository.update(characterId, {
      health: newHealth,
      positionX: newX,
      positionY: newY,
    });

    // Mettre à jour la position en mémoire et notifier le joueur
    for (const player of this.connectedPlayers.values()) {
      if (player.characterId === characterId) {
        player.x = newX;
        player.y = newY;
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

    // Lire la position depuis les colonnes WU (priorité) ou les pixels legacy (fallback).
    // Conversion WU → pixels Phaser ici : le protocole WebSocket reste inchangé.
    let playerX: number;
    let playerY: number;
    try {
      const wuPos = readWorldPosition(character, (c) => ({
        x: (c as unknown as Character).positionX,
        y: (c as unknown as Character).positionY,
      }));
      playerX = Math.round(wuToIsoScreenX(wuPos.worldX, wuPos.worldY));
      playerY = Math.round(wuToIsoScreenY(wuPos.worldX, wuPos.worldY));
    } catch {
      playerX = character.positionX ?? payload.x ?? 400;
      playerY = character.positionY ?? payload.y ?? 300;
    }

    const player: ConnectedPlayer = {
      socketId: client.id,
      characterId: payload.characterId,
      name: character.name,
      sex: character.sex,
      x: playerX,
      y: playerY,
      direction: payload.direction ?? 'down',
    };

    this.connectedPlayers.set(client.id, player);
    client.data.player = {
      characterId: player.characterId,
      name: player.name,
      sex: player.sex,
      x: player.x,
      y: player.y,
      direction: player.direction,
    };

    return { player, previousSocketId };
  }

  updatePlayer(
    client: WorldSocket,
    payload: { x: number; y: number; direction?: string },
  ): ConnectedPlayer | null {
    const player = this.connectedPlayers.get(client.id);
    if (!player) return null;

    player.x = payload.x;
    player.y = payload.y;
    player.direction = payload.direction ?? player.direction;

    client.data.player = {
      characterId: player.characterId,
      name: player.name,
      sex: player.sex,
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
    await this.characterRepository.update(player.characterId, {
      positionX: Math.round(player.x),
      positionY: Math.round(player.y),
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
        await this.characterRepository.update(characterId, { positionX: rx, positionY: ry });
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
