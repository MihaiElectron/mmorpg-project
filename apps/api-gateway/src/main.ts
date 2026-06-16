/**
 * main.ts
 * ----------------------------
 * Point d’entrée de l’application NestJS.
 *
 * Rôle :
 * - Configurer les pipes globaux (ValidationPipe)
 * - Activer CORS pour autoriser le frontend (Vite)
 * - Configurer Swagger pour la documentation
 * - Démarrer le serveur
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { CLIENT_ORIGIN } from './common/cors.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * ---------------------------------------------------------------------------
   * Validation globale des DTOs
   * ---------------------------------------------------------------------------
   * - whitelist : supprime les propriétés inconnues
   * - forbidNonWhitelisted : rejette les champs non autorisés
   * - transform : active class-transformer (OBLIGATOIRE pour WebSocket DTO)
   * - enableImplicitConversion : conversion automatique des types primitifs
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  /**
   * ---------------------------------------------------------------------------
   * CORS (OBLIGATOIRE pour le frontend Vite)
   * ---------------------------------------------------------------------------
   */
  app.enableCors({
    origin: CLIENT_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  /**
   * ---------------------------------------------------------------------------
   * Swagger
   * ---------------------------------------------------------------------------
   * Accessible sur : http://localhost:3000/api/docs
   */
  const config = new DocumentBuilder()
    .setTitle('API Gateway')
    .setDescription('Documentation de l’API du projet')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  /**
   * ---------------------------------------------------------------------------
   * Démarrage du serveur
   * ---------------------------------------------------------------------------
   */
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🚀 API démarrée sur http://localhost:${port}`);
}

void bootstrap();
