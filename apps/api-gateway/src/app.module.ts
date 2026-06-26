/**
 * AppModule
 * ----------------------------
 * Point d'entrée principal du backend NestJS.
 * Configure :
 * - Les modules métier (auth, gateway, common, characters, inventory, resources)
 * - La connexion TypeORM à PostgreSQL
 *
 * synchronize: true → OK en dev, à désactiver en production.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { CharactersModule } from './characters/characters.module';
import { InventoryModule } from './inventory/inventory.module';
import { ResourcesModule } from './resources/resources.module';
import { WorldModule } from './world/world.module';
import { CreaturesModule } from './creatures/creatures.module';
import { AdminModule } from './admin/admin.module';
import { SkillsModule } from './skills/skills.module';
import { CraftingModule } from './crafting/crafting.module';
import { PlayerRuntimeModule } from './player-runtime/player-runtime.module';
import { CreatureRuntimeModule } from './creature-runtime/creature-runtime.module';
import { ItemModule } from './items/item.module';

@Module({
  imports: [
    // -------------------------------------------------------------------------
    // Config global
    // -------------------------------------------------------------------------
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // -------------------------------------------------------------------------
    // TypeORM : connexion PostgreSQL (config via .env) + auto-charge toutes
    // les entités
    // -------------------------------------------------------------------------
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.getOrThrow<string>('DB_USERNAME'),
        password: config.getOrThrow<string>('DB_PASSWORD'),
        database: config.getOrThrow<string>('DB_NAME'),

        // Charge automatiquement TOUTES les entités du projet
        entities: [__dirname + '/**/*.entity.{ts,js}'],

        synchronize: true, // auto-create/update tables pour dev
      }),
    }),

    // -------------------------------------------------------------------------
    // Modules métier
    // -------------------------------------------------------------------------
    AuthModule,
    CommonModule,
    CharactersModule,
    InventoryModule,
    ResourcesModule,
    WorldModule,
    CreaturesModule,
    AdminModule,
    ItemModule,
    SkillsModule,
    CraftingModule,
    PlayerRuntimeModule,
    CreatureRuntimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
