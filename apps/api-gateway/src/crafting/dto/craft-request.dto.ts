import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CraftRequestDto {
  /** UUID de la recette à crafter. */
  @IsUUID()
  recipeId: string;

  /** Nombre de tentatives (1–99). Le serveur traite chaque tentative indépendamment. */
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}
