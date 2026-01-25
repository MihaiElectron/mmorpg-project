import { Controller, Post, Body, Param, Get, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateInventoryDto } from './dto/create-inventory.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  addItem(@Body() dto: CreateInventoryDto) {
    return this.inventoryService.addItem(dto);
  }

  @Post(':characterId/equip/:itemId')
  equipItem(
    @Param('characterId') characterId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.inventoryService.equipItem(characterId, itemId);
  }

  @Post(':characterId/unequip/:slot')
  unequipItem(
    @Param('characterId') characterId: string,
    @Param('slot') slot: string,
  ) {
    return this.inventoryService.unequipItem(characterId, slot);
  }

  @Get(':characterId')
  getInventory(@Param('characterId') characterId: string) {
    return this.inventoryService.getInventory(characterId);
  }
}
