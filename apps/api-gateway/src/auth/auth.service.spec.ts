// src/auth/auth.service.ts

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

interface User {
  id: number;
  username: string;
  password: string; // hashé
}

@Injectable()
export class AuthService {
  private users: User[] = []; // ⚠️ à remplacer par une vraie DB

  constructor(private readonly jwtService: JwtService) {}

  async register(username: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user: User = { id: Date.now(), username, password: hashedPassword };
    this.users.push(user);
    return { message: 'User created', user: { id: user.id, username: user.username } };
  }

  async login(username: string, password: string) {
    const user = this.users.find((u) => u.username === username);
    if (!user) {
      throw new Error('User not found');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    const payload = { sub: user.id, username: user.username };
    const token = this.jwtService.sign(payload);

    return { access_token: token };
  }
}
