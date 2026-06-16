// apps/api-gateway/src/world/world.service.ts

import { Injectable } from '@nestjs/common';
import { WorldSocket } from '../types/world-socket';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Character } from '../characters/entities/character.entity';

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
export class WorldService {
  /**
   * Joueurs connectés, indexés par socket.id
   */
  private connectedPlayers = new Map<string, ConnectedPlayer>();

  constructor(
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
  ) {}

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

    const player: ConnectedPlayer = {
      socketId: client.id,
      characterId: payload.characterId,
      name: character.name,
      sex: character.sex,
      x: character.positionX ?? payload.x ?? 400,
      y: character.positionY ?? payload.y ?? 300,
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

  getPlayersExcept(socketId: string): ConnectedPlayer[] {
    const playersByCharacter = new Map<string, ConnectedPlayer>();

    for (const player of this.connectedPlayers.values()) {
      if (player.socketId !== socketId) {
        playersByCharacter.set(player.characterId, player);
      }
    }

    return Array.from(playersByCharacter.values());
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
