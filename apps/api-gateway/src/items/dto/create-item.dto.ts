import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateItemDto {

  @IsString()
  name: string;

  @IsString()
  type: string;

  @IsString()
  category: string;

  @IsNumber()
  @IsOptional()
  attack: number;

  @IsNumber()
  @IsOptional()
  defense: number;
}
