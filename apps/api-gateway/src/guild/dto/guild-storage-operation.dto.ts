import { IsUUID } from 'class-validator';

export class GuildStorageOperationDto {
  @IsUUID()
  itemInstanceId: string;
}
