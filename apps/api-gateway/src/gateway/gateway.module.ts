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
