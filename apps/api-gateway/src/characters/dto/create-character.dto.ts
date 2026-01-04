import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';

/**
 * CreateCharacterDto
 * -----------------------------------------------------------------------------
 * DTO utilisé pour créer un personnage.
 * IMPORTANT :
 * - Les propriétés doivent correspondre EXACTEMENT à Character.entity.ts.
 * - Toute différence de nom ou de type empêche l'insertion en base.
 * - userId n'est pas envoyé par le frontend : il sera injecté depuis le token.
 * -----------------------------------------------------------------------------
 */
export class CreateCharacterDto {
  @ApiProperty({
    example: 'Mihai',
    description: 'Nom du personnage',
  })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'male',
    description: 'Genre du personnage (male / female / other)',
  })
  @IsString()
  gender: string;

  @ApiProperty({
    example: 'default.png',
    description: 'Avatar du personnage (optionnel)',
    required: false,
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({ example: 10, description: 'Stat de constitution' })
  @IsNumber()
  constitution: number;

  @ApiProperty({ example: 10, description: 'Stat de force' })
  @IsNumber()
  strength: number;

  @ApiProperty({ example: 10, description: 'Stat d’endurance' })
  @IsNumber()
  endurance: number;

  @ApiProperty({ example: 10, description: 'Stat d’agilité' })
  @IsNumber()
  agility: number;

  @ApiProperty({ example: 10, description: 'Stat de dextérité' })
  @IsNumber()
  dexterity: number;

  @ApiProperty({ example: 10, description: 'Stat d’intelligence' })
  @IsNumber()
  intelligence: number;

  // Injecté automatiquement depuis le token dans le controller
  @IsOptional()
  userId?: number;
}
