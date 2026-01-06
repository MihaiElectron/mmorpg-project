/**
 * JwtStrategy
 * -----------------------------------------------------------------------------
 * Rôle général :
 * - Extraire et valider les tokens JWT envoyés par les clients.
 * - Vérifier la signature, l’intégrité et l’expiration du token.
 * - Récupérer le payload signé lors de l’authentification (sub, username).
 * - Injecter ces informations dans req.user pour les routes protégées.
 *
 * Notes :
 * - Cette stratégie ne charge pas l'utilisateur en base.
 *   Elle se contente de valider le token et de renvoyer son contenu.
 * - Les contrôleurs peuvent ensuite utiliser req.user.userId pour
 *   associer des ressources à l'utilisateur authentifié.
 *
 * Emplacement :
 * apps/api-gateway/src/auth/jwt.strategy.ts
 * -----------------------------------------------------------------------------
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Extraction du token
      ignoreExpiration: false,                                  // Refuse les tokens expirés
      secretOrKey: configService.get<string>('JWT_SECRET'),     // Clé secrète JWT
    });
  }

  /**
   * validate()
   * ----------
   * Appelée automatiquement lorsque le token est valide.
   * Le payload correspond aux données signées lors du login :
   *   {
   *     sub: userId,
   *     username: string
   *   }
   *
   * Le retour de cette méthode sera injecté dans req.user.
   */
  async validate(payload: any) {
    const userId = String(payload.sub);

    // Vérification minimale : un token doit contenir un identifiant utilisateur
    if (!userId) {
      throw new UnauthorizedException('Token invalide : identifiant utilisateur manquant.');
    }

    return {
      userId,
      username: payload.username,
    };
  }
}
