// apps/api-gateway/src/common/ws-auth.service.ts
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { WorldSocket } from '../types/world-socket';

export type WsAuthPayload = {
  userId: string;
  username?: string;
  role?: string;
};

type JwtPayload = {
  sub?: string;
  username?: string;
  role?: string;
};

/**
 * Valide le JWT transmis par un client Socket.IO à la connexion.
 * Mutualisé entre les gateways (world, resources, animals) qui partagent
 * la même connexion socket côté client.
 */
@Injectable()
export class WsAuthService {
  constructor(private readonly jwtService: JwtService) {}

  async authenticate(client: WorldSocket): Promise<WsAuthPayload | null> {
    const token = this.extractToken(client);
    if (!token) return null;

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

      if (!payload?.sub) return null;

      return { userId: String(payload.sub), username: payload.username, role: payload.role };
    } catch {
      return null;
    }
  }

  private extractToken(client: WorldSocket): string | null {
    const authToken: unknown = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }

    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }

    return null;
  }
}
