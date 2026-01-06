/**
 * CreateCharacterDto — Version simplifiée pour MVP
 * -----------------------------------------------------------------------------
 * Correspond EXACTEMENT aux données envoyées par le frontend :
 * { name, sex }
 * -----------------------------------------------------------------------------
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateCharacterDto {
  @ApiProperty({ example: 'Setel', description: 'Nom du personnage' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'female',
    description: 'Sexe du personnage (male / female)',
  })
  @IsString()
  sex: string;

  @ApiProperty({
    example: 'default.png',
    required: false,
    description: 'Avatar optionnel',
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  userId?: string;
}
