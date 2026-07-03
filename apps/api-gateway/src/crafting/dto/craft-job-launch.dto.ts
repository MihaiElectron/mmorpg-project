import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class CraftJobLaunchDto {
  /** UUID de la recette à produire. */
  @IsUUID()
  recipeId: string;

  /** Nombre d'unités à produire (1–99). Le serveur traite chaque unité. */
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}
