/**
 * Rôle : point d’entrée de l’application NestJS.
 * - Configure Swagger pour exposer la documentation sur /api/docs.
 * - Active la validation globale des DTOs avec ValidationPipe (class-validator / class-transformer).
 * - Active CORS pour permettre au frontend (React/Vite) d’appeler l’API depuis un autre port.
 * - Configure le port d’écoute de l’application (par défaut 3000 ou valeur de process.env.PORT).
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Active la validation pour tous les DTOs
  app.useGlobalPipes(new ValidationPipe());

  // Active CORS (Cross-Origin Resource Sharing)
  app.enableCors({
    origin: 'http://localhost:5173', // URL de ton frontend (Vite par défaut)
    credentials: true,               // autorise cookies/headers d’auth
  });

  // Config Swagger
  const config = new DocumentBuilder()
    .setTitle('API Gateway')
    .setDescription("Documentation de l’API du projet")
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Démarrage du serveur
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
