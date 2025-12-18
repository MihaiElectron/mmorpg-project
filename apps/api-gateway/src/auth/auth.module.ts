// Module dédié à l'authentification/autorisation (JWT, sessions, guards). Les
// contrôleurs et services de sécurité doivent être déclarés ici.
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  providers: [AuthService],
  controllers: [AuthController]
})
export class AuthModule {}
