import { IsUUID } from 'class-validator';

export class BankOperationDto {
  @IsUUID()
  itemInstanceId: string;
}
