/**
 * Controller d'authentification :
 * - Utilise les DTOs pour valider automatiquement les données reçues.
 * - Expose les routes HTTP /auth/register et /auth/login.
 * - Transmet les données reçues au service AuthService.
 * - Retourne directement la réponse du service au client.
 */

import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /auth/register
  @Post('register')
  async register(@Body() body: RegisterUserDto) {
    return this.authService.register(body.username, body.password);
  }

  // POST /auth/login
  @Post('login')
  async login(@Body() body: LoginUserDto) {
    return this.authService.login(body.username, body.password);
  }
}
