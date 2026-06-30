import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CharacterService } from '../characters/character.service';
import { AuctionService } from './auction.service';
import { BuildingsService } from '../buildings/buildings.service';
import { WorldService } from '../world/world.service';
import { BuildingType } from '../buildings/enums/building-type.enum';
import { BuildingState } from '../buildings/enums/building-state.enum';
import { CreateListingDto } from './dto/create-listing.dto';

@Controller('auction')
@UseGuards(JwtAuthGuard)
export class AuctionController {
  constructor(
    private readonly auctionService: AuctionService,
    private readonly characterService: CharacterService,
    private readonly buildingsService: BuildingsService,
    private readonly worldService: WorldService,
  ) {}

  private async validateBuildingAccess(
    userId: string,
    buildingId: string,
    expectedType: BuildingType,
  ): Promise<void> {
    const character = await this.characterService.findFirstByUser(userId);
    const building = await this.buildingsService.findBuildingById(buildingId);
    if (!building) throw new BadRequestException(`Building "${buildingId}" introuvable.`);
    if (!building.template) throw new BadRequestException('Template building introuvable.');
    if (building.template.buildingType !== expectedType) {
      throw new BadRequestException(`Ce building n'est pas de type "${expectedType}".`);
    }
    if (building.state !== BuildingState.ACTIVE) {
      throw new BadRequestException(`Le building n'est pas actif.`);
    }
    if (!building.template.enabled) {
      throw new BadRequestException(`Le template building est désactivé.`);
    }
    const charPos = {
      worldX: character.worldX ?? 0,
      worldY: character.worldY ?? 0,
      mapId: character.mapId ?? 1,
    };
    const buildingPos = { worldX: building.worldX, worldY: building.worldY, mapId: building.mapId };
    const error = this.worldService.validateInteraction(charPos, buildingPos, building.template.interactionRadiusWU);
    if (error) throw new BadRequestException(`Trop loin de l'hôtel des ventes : ${error}`);
  }

  @Get('listings')
  async getActiveListings(
    @Request() req,
    @Query('buildingId') buildingId?: string,
  ) {
    if (buildingId) {
      await this.validateBuildingAccess(req.user.userId, buildingId, BuildingType.AUCTION_HOUSE);
    }
    return this.auctionService.getActiveListings();
  }

  @Get('listings/mine')
  async getMyListings(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.auctionService.getSellerListings(character.id);
  }

  @Get('listings/pending-as-buyer')
  async getPendingAsBuyer(@Request() req) {
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.auctionService.getBuyerPendingListings(character.id);
  }

  @Post('listings')
  async createListing(
    @Request() req,
    @Body() dto: CreateListingDto,
  ) {
    await this.validateBuildingAccess(req.user.userId, dto.buildingId, BuildingType.AUCTION_HOUSE);
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
  async buyListing(
    @Request() req,
    @Param('id') listingId: string,
    @Body() body: { buildingId: string },
  ) {
    if (!body?.buildingId) throw new BadRequestException('buildingId est obligatoire.');
    await this.validateBuildingAccess(req.user.userId, body.buildingId, BuildingType.AUCTION_HOUSE);
    const character = await this.characterService.findFirstByUser(req.user.userId);
    return this.auctionService.buyListing({
      buyerCharacterId: character.id,
      listingId,
    });
  }

}
