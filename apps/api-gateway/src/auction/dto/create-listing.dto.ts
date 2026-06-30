import { IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { AUCTION_ALLOWED_DURATIONS_HOURS, AuctionDurationHours } from '../entities/auction-listing.entity';

export class CreateListingDto {
  @IsUUID()
  buildingId: string;

  // Branche INSTANCE : fournir itemInstanceId
  @IsOptional()
  @IsUUID()
  itemInstanceId?: string;

  // Branche STACKABLE : fournir itemId + quantity
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  quantity?: number;

  @IsInt()
  @IsPositive()
  @Max(Number.MAX_SAFE_INTEGER)
  @Type(() => Number)
  buyoutPriceBronze: number;

  @IsInt()
  @IsIn(AUCTION_ALLOWED_DURATIONS_HOURS)
  @Type(() => Number)
  durationHours: AuctionDurationHours;
}
