/**
 * AuthService
 * -----------
 * Service responsable de :
 * - L'inscription (register)
 * - La connexion (login)
 * - La validation d'utilisateur pour JwtStrategy
 *
 * Utilise des exceptions NestJS pour renvoyer des erreurs HTTP propres :
 * - ConflictException (409) si username déjà pris
 * - UnauthorizedException (401) si mot de passe incorrect
 * - NotFoundException (404) si utilisateur introuvable
 */

import { Injectable, ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly jwtService: JwtService,
  ) {}

  /**
   * register()
   * ----------
   * Crée un nouvel utilisateur.
   * - Vérifie que le username n'est pas déjà utilisé.
   * - Hash le mot de passe.
   * - Sauvegarde l'utilisateur.
   */
  async register(username: string, password: string) {
    const exists = await this.userRepository.findOne({ where: { username } });

    if (exists) {
      throw new ConflictException('Ce nom d’utilisateur est déjà utilisé');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = this.userRepository.create({
      username,
      password: hashedPassword,
      isActive: true,
    });

    return this.userRepository.save(user);
  }

  /**
   * login()
   * -------
   * Vérifie les identifiants et génère un token JWT.
   */
  async login(username: string, password: string) {
    const user = await this.userRepository.findOne({ where: { username } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Ce compte est désactivé');
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Mot de passe incorrect');
    }

    const payload = {
      sub: user.id,
      username: user.username,
    };

    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  /**
   * validateUser()
   * --------------
   * Utilisé par JwtStrategy pour valider un utilisateur via son ID.
   */
  async validateUser(userId: number) {
    return this.userRepository.findOne({ where: { id: userId } });
  }
}
