import { IsUUID } from 'class-validator';

export class HousingOperationDto {
  @IsUUID()
  itemInstanceId: string;
}
