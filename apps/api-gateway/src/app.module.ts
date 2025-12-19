/**
 * AppModule
 * ----------------------------
 * Point d'entrée principal du backend NestJS.
 * On y déclare :
 * - Les modules métier exposés par l'API gateway (auth, gateway temps-réel, common, characters).
 * - La configuration de TypeORM pour la connexion à la base de données.
 *
 * ⚠️ Note : `synchronize: true` est pratique en dev car il crée/maj les tables automatiquement,
 *           mais à désactiver en production pour éviter les pertes de données.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { CommonModule } from './common/common.module';
import { CharactersModule } from './characters/characters.module';
import { User } from './users/user.entity';

@Module({
  imports: [
    // Charge .env et rend ConfigService disponible partout
    ConfigModule.forRoot({
      isGlobal: true, // important pour éviter de devoir l'importer partout
    }),
    // Configuration de la connexion à la base via TypeORM
    TypeOrmModule.forRoot({
      type: 'postgres',          // ou 'mysql', 'sqlite' selon ta base
      host: 'localhost',
      port: 5432,
      username: 'semoa',      // à adapter
      password: 'ssap',    // à adapter
      database: 'mmorpgdb',        // nom de ta base
      entities: [User],          // entités à charger
      synchronize: true,         // auto-création des tables en dev
    }),

    // Modules métier
    AuthModule,
    GatewayModule,
    CommonModule,
    CharactersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
