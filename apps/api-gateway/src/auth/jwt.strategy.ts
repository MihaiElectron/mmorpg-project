/**
 * JwtStrategy
 * -----------------------------------------------------------------------------
 * Rôle :
 * - Valider les tokens JWT envoyés dans l'en-tête Authorization: Bearer <token>.
 * - Vérifier la signature et l'expiration du token.
 * - Extraire le payload signé lors du login : { sub: userId, username }.
 * - Injecter ce payload dans req.user pour les contrôleurs protégés.
 *
 * Notes importantes :
 * - Cette stratégie NE charge PAS l'utilisateur en base.
 *   → On retourne directement le payload du token.
 *   → Cela garantit que req.user.sub est toujours disponible.
 *
 * - Le CharactersController dépend de req.user.sub pour injecter userId
 *   lors de la création d'un personnage.
 *
 * Emplacement :
 * mmorpg-project/apps/api-gateway/src/auth/jwt.strategy.ts
 * -----------------------------------------------------------------------------
 */

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Récupère le token
      ignoreExpiration: false,                                  // Refuse les tokens expirés
      secretOrKey: configService.get<string>('JWT_SECRET'),     // Clé venant du .env
    });
  }

  /**
   * validate()
   * ----------
   * Appelé automatiquement si le token est valide.
   *
   * payload = {
   *   sub: userId,
   *   username: string
   * }
   *
   * Le retour de cette méthode sera injecté dans req.user.
   * → CharactersController peut alors faire : dto.userId = req.user.sub
   */
  async validate(payload: any) {
    return {
      userId: payload.sub,
      username: payload.username,
    };
  }
}
