// Endpoint « gameplay » exposé par l'API gateway. C'est ici qu'on déclare
// les routes liées aux interactions du MMO (création de personnage, actions
// de jeu, etc.). Ajoutez vos contrôleurs/services de logique métier dans ce
// module.
import { Module } from '@nestjs/common';
import { Controller, Post, Body } from '@nestjs/common';

@Controller('characters')
export class GatewayController {
  @Post()
  createCharacter(@Body() dto: { username: string }) {
    return { message: 'Personnage créé', player: { username: dto.username, level: 1 } };
  }
}
@Module({
    controllers: [GatewayController], // <-- déclaration du contrôleur
})
export class GatewayModule {}
