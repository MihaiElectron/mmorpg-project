/**
 * JwtAuthGuard
 * ------------
 * Ce guard utilise JwtStrategy pour protéger les routes.
 *
 * - Si le token est valide → accès autorisé.
 * - Si le token est invalide ou absent → 401 Unauthorized.
 */

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
