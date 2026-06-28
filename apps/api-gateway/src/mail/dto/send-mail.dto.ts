import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendMailDto {
  @IsUUID()
  recipientCharacterId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  subject: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  body?: string;

  @IsUUID()
  @IsOptional()
  itemInstanceId?: string;
}
