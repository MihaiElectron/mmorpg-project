/**
 * Cette stratégie JWT permet de sécuriser les routes avec @UseGuards(AuthGuard('jwt')).
 * - Elle utilise la clé secrète définie dans JwtModule pour vérifier la validité du token.
 * - validate(payload) est appelée automatiquement si le token est valide.
 * - Le payload correspond aux données signées lors du login (ex: { sub: user.id, username }).
 * - La valeur retournée par validate est injectée dans req.user et disponible dans les contrôleurs.
 */

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // Récupère le token depuis l'en-tête Authorization: Bearer <token>
      ignoreExpiration: false, // Refuse les tokens expirés
      secretOrKey: 'SECRET_KEY', // ⚠️ à mettre dans .env et charger via ConfigModule
    });
  }

  async validate(payload: any) {
    // payload contient les données signées lors du login (ex: { sub: user.id, username })
    // Ici on peut enrichir l'objet utilisateur si nécessaire (ex: rôles, permissions).
    return { userId: payload.sub, username: payload.username };
  }
}
