/**
 * UserModule
 * ----------
 * Ce module encapsule toute la logique liée à l'entité User.
 *
 * Rôle :
 * - Déclarer l'entité User auprès de TypeORM via TypeOrmModule.forFeature().
 * - Permettre l'injection du UserRepository dans les services (ex: AuthService).
 * - Exporter TypeOrmModule pour que d'autres modules (AuthModule, etc.)
 *   puissent accéder au UserRepository sans le redéclarer.
 *
 * Notes :
 * - Aucun controller ici : ce module ne gère pas de routes.
 * - Aucun service ici : il sert uniquement de module "d'accès aux données".
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';

@Module({
  // On enregistre l'entité User pour permettre l'injection du Repository<User>
  imports: [TypeOrmModule.forFeature([User])],

  // On exporte TypeOrmModule pour que d'autres modules puissent utiliser UserRepository
  exports: [TypeOrmModule],
})
export class UserModule {}
