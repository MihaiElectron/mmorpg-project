import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CharacterEquipment } from '../../characters/entities/character-equipment.entity';
import {
  ItemInstance,
  ItemInstanceContainerType,
  ItemInstanceState,
} from '../../item-instances/entities/item-instance.entity';
import { Item } from '../../items/entities/item.entity';
import { Inventory } from '../entities/inventory.entity';
import { InventoryEntryDto } from './inventory-entry.dto';
import {
  buildEquippedSets,
  mapInstanceToEntry,
  mapStackToEntry,
} from './inventory-entry.mapper';

@Injectable()
export class InventoryProjectionService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(ItemInstance)
    private readonly instanceRepository: Repository<ItemInstance>,
    @InjectRepository(CharacterEquipment)
    private readonly equipmentRepository: Repository<CharacterEquipment>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {}

  async project(characterId: string): Promise<InventoryEntryDto[]> {
    const [stacks, instances, equipment] = await Promise.all([
      this.inventoryRepository.find({
        where: { character: { id: characterId } },
        relations: ['item'],
        // Base déterministe pour le repli (entrées sans slotIndex).
        order: { createdAt: 'ASC', id: 'ASC' },
      }),
      // Seules les instances réellement en inventaire sont projetées.
      // Une instance EQUIPPED vit dans le container EQUIPMENT et ne doit
      // jamais apparaître comme objet disponible : la re-équiper leverait
      // "state should be AVAILABLE but is EQUIPPED".
      this.instanceRepository.find({
        where: [
          { ownerId: characterId, containerType: ItemInstanceContainerType.INVENTORY },
        ],
        order: { createdAt: 'ASC', id: 'ASC' },
      }),
      this.equipmentRepository.find({ where: { characterId } }),
    ]);

    const sets = buildEquippedSets(equipment);

    // Filet de sécurité : exclut explicitement tout état non disponible en
    // inventaire (EQUIPPED, DESTROYED, ARCHIVED) même si le containerType
    // serait incohérent avec le state.
    const activeInstances = instances.filter(
      (i) =>
        i.state !== ItemInstanceState.EQUIPPED &&
        i.state !== ItemInstanceState.DESTROYED &&
        i.state !== ItemInstanceState.ARCHIVED,
    );

    let instanceItemMap = new Map<string, Item>();
    if (activeInstances.length > 0) {
      const itemIds = [...new Set(activeInstances.map((i) => i.itemId))];
      const items = await this.itemRepository.findBy({ id: In(itemIds) });
      instanceItemMap = new Map(items.map((item) => [item.id, item]));
    }

    const stackEntries = stacks.map((inv) => mapStackToEntry(inv, sets));
    const instanceEntries = activeInstances
      .map((inst) => {
        const item = instanceItemMap.get(inst.itemId);
        if (!item) return null;
        return mapInstanceToEntry(inst, item, sets);
      })
      .filter((e): e is InventoryEntryDto => e !== null);

    // Ordre stable et identique pour /characters/me et /admin/characters/:id/details :
    // 1) entrées avec slotIndex non null, par slotIndex ASC ;
    // 2) puis entrées sans slotIndex, dans l'ordre createdAt/id (tri stable JS).
    const combined = [...stackEntries, ...instanceEntries];
    combined.sort((a, b) => {
      const aHas = a.slotIndex != null;
      const bHas = b.slotIndex != null;
      if (aHas && bHas) return (a.slotIndex as number) - (b.slotIndex as number);
      if (aHas) return -1;
      if (bHas) return 1;
      return 0;
    });
    return combined;
  }
}
