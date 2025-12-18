/**
 * Rôle : point d’entrée de l’application NestJS.
 * - Configure Swagger pour exposer la documentation sur /api/docs.
 * - Active la validation globale des DTOs avec ValidationPipe (class-validator / class-transformer).
 *   => Cela permet de vérifier automatiquement les données reçues dans les requêtes.
 * - Configure le port d’écoute de l’application (par défaut 3000 ou valeur de process.env.PORT).
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Active la validation pour tous les DTOs
  // Toute requête sera validée selon les règles définies dans les classes DTO
  app.useGlobalPipes(new ValidationPipe());

  // Config Swagger
  const config = new DocumentBuilder()
    .setTitle('API Gateway')
    .setDescription("Documentation de l’API du projet")
    .setVersion('1.0')
    .addBearerAuth() // ajoute le support JWT dans Swagger
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Démarrage du serveur sur le port défini
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
