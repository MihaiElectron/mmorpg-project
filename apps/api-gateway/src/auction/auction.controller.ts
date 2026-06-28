import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { AuctionService } from './auction.service';
import { CreateListingDto } from './dto/create-listing.dto';

@Controller('auction')
@UseGuards(JwtAuthGuard)
export class AuctionController {
  constructor(
    private readonly auctionService: AuctionService,
    private readonly characterService: CharacterService,
  ) {}

  @Get('listings')
  getActiveListings() {
    return this.auctionService.getActiveListings();
  }

  @Get('listings/mine')
  async getMyListings(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.auctionService.getSellerListings(character.id);
  }

  @Post('listings')
  async createListing(@Request() req, @Body() dto: CreateListingDto) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.auctionService.createListing({
      sellerCharacterId: character.id,
      itemInstanceId: dto.itemInstanceId,
      buyoutPriceBronze: BigInt(dto.buyoutPriceBronze),
      durationHours: dto.durationHours,
    });
  }

  @Delete('listings/:id')
  async cancelListing(@Request() req, @Param('id') listingId: string) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.auctionService.cancelListing(character.id, listingId);
  }

  @Post('listings/:id/buy')
  async buyListing(@Request() req, @Param('id') listingId: string) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.auctionService.buyListing({
      buyerCharacterId: character.id,
      listingId,
    });
  }

  @Post('listings/:id/claim-buyer')
  async claimBuyer(@Request() req, @Param('id') listingId: string) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.auctionService.claimBuyer(character.id, listingId);
  }

  @Post('listings/:id/claim-seller')
  async claimSeller(@Request() req, @Param('id') listingId: string) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.auctionService.claimSeller(character.id, listingId);
  }
}
