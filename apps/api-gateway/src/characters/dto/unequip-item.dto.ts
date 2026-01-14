import { IsString } from 'class-validator';

export class UnequipItemDto {
  @IsString()
  slot: string; // 'head', 'chest', 'legs', 'weapon', 'shield', etc.
}

