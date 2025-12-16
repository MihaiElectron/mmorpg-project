// Contrôleur racine : expose les routes génériques (healthcheck, info). Injecte
// les services nécessaires pour répondre aux endpoints publics de base.
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
