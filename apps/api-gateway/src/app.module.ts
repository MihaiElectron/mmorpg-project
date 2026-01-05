/**
 * AppModule
 * ----------------------------
 * Point d'entrée principal du backend NestJS.
 * Configure :
 * - Les modules métier (auth, gateway, common, characters)
 * - La connexion TypeORM à PostgreSQL
 *
 * ⚠ synchronize: true → OK en dev, à désactiver en production.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { CharactersModule } from './characters/characters.module';

// 🔥 Log clair pour vérifier la connexion DB
console.log('>>> Connecting to PostgreSQL with config:', {
  host: 'localhost',
  port: 5432,
  username: 'semoa',
  password: 'ssap',
  database: 'mmorpgdb',
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'semoa',
      password: 'ssap',
      database: 'mmorpgdb',

      // 🔥 Charge automatiquement TOUTES les entités du projet
      entities: [__dirname + '/**/*.entity.{ts,js}'],

      synchronize: true, // OK en dev
    }),

    AuthModule,
    CommonModule,
    CharactersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
