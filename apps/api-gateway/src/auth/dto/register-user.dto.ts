/**
 * DTO pour l'inscription d'un utilisateur.
 * - Définit les champs attendus dans la requête POST /auth/register.
 * - Permet d'ajouter des décorateurs de validation (class-validator).
 */

import { IsString, MinLength } from 'class-validator';

export class RegisterUserDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(6) // impose un mot de passe d'au moins 6 caractères
  password: string;
}
