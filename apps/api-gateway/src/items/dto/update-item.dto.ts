import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  attack?: number;

  @IsOptional()
  @IsNumber()
  defense?: number;
}
