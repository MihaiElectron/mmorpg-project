import { ApiProperty } from '@nestjs/swagger';

export class CreateCharacterDto {
  @ApiProperty({ example: 'Mihai', description: 'Nom du personnage' })
  name: string;

  @ApiProperty({ example: 'Warrior', description: 'Classe du personnage' })
  role: string;
}