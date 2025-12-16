// Point d'entrée principal du backend NestJS : on y déclare tous les modules
// métier que l'API gateway expose. Chaque nouvelle fonctionnalité (auth,
// gateway temps-réel, outils communs, etc.) se branche ici pour être prise en
// compte par l'application.
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { CommonModule } from './common/common.module';
import { CharactersModule } from './characters/characters.module';

@Module({
  imports: [AuthModule, GatewayModule, CommonModule, CharactersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
