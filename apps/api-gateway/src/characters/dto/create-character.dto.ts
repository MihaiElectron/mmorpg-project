import { IsIn, IsString, MinLength } from 'class-validator';

export class CreateCharacterDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsString()
  @IsIn(['male', 'female'])
  sex: string;
}

