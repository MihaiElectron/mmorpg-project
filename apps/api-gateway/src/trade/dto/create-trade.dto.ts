import { IsUUID } from 'class-validator';

export class CreateTradeDto {
  @IsUUID()
  targetCharacterId: string;
}
