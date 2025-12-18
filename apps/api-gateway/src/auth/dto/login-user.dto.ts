/**
 * DTO pour la connexion d'un utilisateur.
 * - Définit les champs attendus dans la requête POST /auth/login.
 * - Permet d'ajouter des règles de validation si nécessaire.
 */

import { IsString } from 'class-validator';

export class LoginUserDto {
  @IsString()
  username: string;

  @IsString()
  password: string;
}
