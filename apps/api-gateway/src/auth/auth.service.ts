/**
 * Service d'authentification :
 * - Gère la création d'utilisateurs avec hash du mot de passe (bcrypt).
 * - Gère le login en vérifiant le mot de passe et en générant un token JWT.
 * - Les méthodes register et login doivent correspondre exactement à ce que le controller appelle.
 */

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

interface User {
  id: number;
  username: string;
  password: string; // stocké sous forme hashée
}

@Injectable()
export class AuthService {
  private users: User[] = []; // ⚠️ à remplacer par une vraie base de données

  constructor(private readonly jwtService: JwtService) {}

  // Création d'un utilisateur avec hash du mot de passe
  async register(username: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user: User = { id: Date.now(), username, password: hashedPassword };
    this.users.push(user);

    // On ne renvoie pas le mot de passe hashé au client
    return { id: user.id, username: user.username };
  }

  // Vérification des credentials et génération du token JWT
  async login(username: string, password: string) {
    const user = this.users.find((u) => u.username === username);
    if (!user) {
      throw new Error('User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Payload = données signées dans le token
    const payload = { sub: user.id, username: user.username };
    const token = this.jwtService.sign(payload);

    return { access_token: token };
  }
}
