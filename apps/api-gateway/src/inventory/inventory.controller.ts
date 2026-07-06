import { Controller, Post, Patch, Body, Param, Get, UseGuards, Request } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventorySlotsDto } from './dto/update-inventory-slots.dto';

@Controller('inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  addItem(
    @Body() dto: CreateInventoryDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.inventoryService.addItem(dto, req.user.userId);
  }

  @Post(':characterId/equip/:itemId')
  equipItem(
    @Param('characterId') characterId: string,
    @Param('itemId') itemId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.inventoryService.equipItem(
      characterId,
      itemId,
      req.user.userId,
    );
  }

  @Post(':characterId/equip-instance/:instanceId')
  equipItemInstance(
    @Param('characterId') characterId: string,
    @Param('instanceId') instanceId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.inventoryService.equipItemInstance(characterId, instanceId, req.user.userId);
  }

  @Post(':characterId/unequip/:slot')
  unequipItem(
    @Param('characterId') characterId: string,
    @Param('slot') slot: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.inventoryService.unequipItem(
      characterId,
      slot,
      req.user.userId,
    );
  }

  @Patch(':characterId/slots')
  updateSlots(
    @Param('characterId') characterId: string,
    @Body() dto: UpdateInventorySlotsDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.inventoryService.updateSlots(characterId, req.user.userId, dto);
  }

  @Get(':characterId')
  getInventory(
    @Param('characterId') characterId: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.inventoryService.getInventory(characterId, req.user.userId);
  }
}
