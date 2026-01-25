// apps/api-gateway/src/resources/dto/interact-resource.dto.ts
import { IsUUID } from 'class-validator';

export class InteractResourceDto {
  @IsUUID()
  targetId: string;
}
