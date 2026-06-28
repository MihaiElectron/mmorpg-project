import { IsUUID } from 'class-validator';

export class TradeItemDto {
  @IsUUID()
  itemInstanceId: string;
}
