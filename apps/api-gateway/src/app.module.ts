/**
 * AppModule
 * ----------------------------
 * Point d'entrée principal du backend NestJS.
 * Configure :
 * - Les modules métier (auth, gateway, common, characters, inventory, resources)
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
import { InventoryModule } from './inventory/inventory.module';
import { ResourcesModule } from './resources/resources.module';
import { WorldModule } from './world/world.module';
import { AnimalsModule } from './animals/animals.module';

console.log('>>> Connecting to PostgreSQL with config:', {
  host: 'localhost',
  port: 5432,
  username: 'semoa',
  password: 'ssap',
  database: 'mmorpgdb',
});

@Module({
  imports: [
    // -------------------------------------------------------------------------
    // Config global
    // -------------------------------------------------------------------------
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // -------------------------------------------------------------------------
    // TypeORM : connexion PostgreSQL + auto-charge toutes les entités
    // -------------------------------------------------------------------------
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'semoa',
      password: 'ssap',
      database: 'mmorpgdb',

      // 🔥 Charge automatiquement TOUTES les entités du projet
      entities: [__dirname + '/**/*.entity.{ts,js}'],

      synchronize: true, // ⚠ auto-create/update tables pour dev
    }),

    // -------------------------------------------------------------------------
    // Modules métier
    // -------------------------------------------------------------------------
    AuthModule,
    CommonModule,
    CharactersModule,
    InventoryModule,
    ResourcesModule, // ⭐ Ajout propre ici
    WorldModule,
    AnimalsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
