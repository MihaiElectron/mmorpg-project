// main.ts
// Rôle : point d’entrée de l’application NestJS.
// Configure Swagger pour exposer la documentation sur /api/docs.

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Config Swagger
  const config = new DocumentBuilder()
    .setTitle('API Gateway')
    .setDescription("Documentation de l’API du projet")
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Un seul listen
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();