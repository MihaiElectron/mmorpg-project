/**
 * JwtStrategy
 * -----------
 * Cette stratégie JWT permet de sécuriser les routes avec @UseGuards(AuthGuard('jwt')).
 *
 * Rôle :
 * - Extraire le token depuis l'en-tête Authorization: Bearer <token>.
 * - Vérifier la signature du token avec la clé secrète (chargée depuis .env).
 * - Vérifier l'expiration du token.
 * - Extraire le payload signé lors du login (ex: { sub: user.id, username }).
 * - Charger l'utilisateur en base via AuthService.
 * - Retourner l'utilisateur complet pour l'injecter dans req.user.
 *
 * Si le token est invalide ou expiré → Nest renvoie automatiquement 401.
 */

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Récupère le token
      ignoreExpiration: false, // Refuse les tokens expirés
      secretOrKey: configService.get<string>('JWT_SECRET'), // Clé venant du .env
    });
  }

  /**
   * validate()
   * ----------
   * Appelé automatiquement si le token est valide.
   * payload = { sub: userId, username }
   *
   * On charge l'utilisateur en base et on le retourne.
   * Ce retour sera accessible dans req.user.
   */
  async validate(payload: any) {
    const user = await this.authService.validateUser(payload.sub);

    // Si l'utilisateur n'existe plus ou est désactivé → 401
    if (!user || !user.isActive) {
      return null;
    }

    return user; // Injecté dans req.user
  }
}
