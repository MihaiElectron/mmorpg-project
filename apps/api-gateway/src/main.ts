/**
 * main.ts
 * ----------------------------
 * Point d’entrée de l’application NestJS.
 *
 * Rôle :
 * - Configurer les pipes globaux (ValidationPipe)
 * - Activer CORS pour autoriser le frontend
 * - Configurer Swagger pour la documentation
 * - Démarrer le serveur sur le port défini
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * Validation globale des DTOs
   * ----------------------------
   * - whitelist : supprime les propriétés inconnues
   * - forbidNonWhitelisted : rejette les requêtes avec des champs non autorisés
   * - transform : convertit automatiquement les types (string → number, etc.)
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
   * CORS
   * ----
   * Autorise le frontend (Vite) à appeler l’API.
   */
  app.enableCors({
    origin: 'http://localhost:5173',
    credentials: true,
  });

  /**
   * Swagger
   * -------
   * Documentation interactive disponible sur /api/docs
   */
  const config = new DocumentBuilder()
    .setTitle('API Gateway')
    .setDescription('Documentation de l’API du projet')
    .setVersion('1.0')
    .addBearerAuth() // Authentification JWT dans Swagger
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  /**
   * Démarrage du serveur
   */
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 API démarrée sur http://localhost:${port}`);
}

bootstrap();
