import { IsIn, IsInt, IsPositive, IsUUID, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { AUCTION_ALLOWED_DURATIONS_HOURS, AuctionDurationHours } from '../entities/auction-listing.entity';

export class CreateListingDto {
  @IsUUID()
  buildingId: string;

  @IsUUID()
  itemInstanceId: string;

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
