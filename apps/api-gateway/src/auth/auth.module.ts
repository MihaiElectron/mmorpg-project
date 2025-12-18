/**
 * Ce module regroupe toute la logique d'authentification.
 * - Il importe PassportModule pour gérer les stratégies d'authentification.
 * - Il configure JwtModule avec une clé secrète et une durée de vie des tokens.
 * - Il déclare AuthController pour exposer les routes /auth/register et /auth/login.
 * - Il déclare AuthService pour la logique métier (création d’utilisateur, login, génération de token).
 * - Il enregistre JwtStrategy comme provider pour valider les tokens et sécuriser les routes.
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: 'SECRET_KEY', // ⚠️ à mettre dans .env
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
