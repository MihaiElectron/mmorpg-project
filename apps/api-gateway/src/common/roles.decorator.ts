import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/entities/user.entity';

export const ROLES_KEY = 'roles';

/**
 * Restreint une route aux roles donnes. A utiliser avec RolesGuard,
 * et apres JwtAuthGuard (qui peuple request.user).
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
