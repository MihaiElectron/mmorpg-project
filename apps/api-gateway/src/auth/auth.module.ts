/**
 * AuthModule
 * ----------
 * Ce module regroupe toute la logique d'authentification de l'application.
 *
 * Rôle :
 * - Importer PassportModule pour gérer les stratégies d'authentification.
 * - Configurer JwtModule avec une clé secrète et une durée de vie des tokens.
 * - Importer UserModule pour accéder au UserRepository (via TypeORM).
 * - Déclarer AuthController pour exposer les routes /auth/register et /auth/login.
 * - Déclarer AuthService pour la logique métier (création d’utilisateur, login, génération de token).
 * - Enregistrer JwtStrategy comme provider pour valider les tokens et sécuriser les routes.
 *
 * Notes :
 * - La clé JWT est chargée dynamiquement depuis le fichier .env via ConfigService.
 * - Le module est autonome et exportable si besoin.
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { UserModule } from '../users/user.module';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    // Permet d'utiliser process.env via ConfigService
    ConfigModule,

    // Permet d'injecter UserRepository dans AuthService
    UserModule,

    // Gestion des stratégies d'authentification (JWT, etc.)
    PassportModule,

    // Configuration dynamique du module JWT
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'), // Clé dans .env
        signOptions: { expiresIn: '1h' },          // Durée de vie du token
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
