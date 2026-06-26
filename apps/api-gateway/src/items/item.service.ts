import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from './entities/item.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Inventory } from '../inventory/entities/inventory.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';

/** Items de loot et de craft garantis présents en DB au démarrage. */
export const LOOT_ITEM_SEEDS: Pick<
  Item,
  'name' | 'type' | 'category' | 'image'
>[] = [
  // ── Loot resources ───────────────────────────────────────────────────────
  {
    name: 'Bâton de bois',
    type: 'material',
    category: 'wooden_stick',
    image: '/assets/images/items/wooden_stick.png',
  },
  {
    name: 'Minerai de fer',
    type: 'material',
    category: 'iron_ore',
    image: null,
  },
  // ── Craft outputs (Phase 1) ───────────────────────────────────────────────
  {
    name: 'Lingot de fer',
    type: 'material',
    category: 'iron_bar',
    image: null,
  },
  {
    name: 'Manche brut',
    type: 'material',
    category: 'basic_handle',
    image: null,
  },
  {
    name: 'Lame brute',
    type: 'material',
    category: 'rough_blade',
    image: null,
  },
  {
    name: 'Épée basique',
    type: 'weapon',
    category: 'basic_sword',
    image: null,
  },
];

export const CANONICAL_WOODEN_STICK = {
  category: 'wooden_stick',
  type: 'material',
  image: '/assets/images/items/wooden_stick.png',
} as const;

export const LEGACY_WOODEN_STICK_MATCH = {
  category: 'resource',
  type: 'wooden_stick',
} as const;

@Injectable()
export class ItemService implements OnModuleInit {
  constructor(
    @InjectRepository(Item)
    private readonly repo: Repository<Item>,
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    @InjectRepository(CharacterEquipment)
    private readonly equipmentRepo: Repository<CharacterEquipment>,
  ) {}

  async onModuleInit() {
    await this.seedLootItems();
    await this.mergeLegacyWoodenStickItems();
  }

  private async seedLootItems(): Promise<void> {
    for (const seed of LOOT_ITEM_SEEDS) {
      // Vérifie par (category, type) : category seul n'est pas unique (famille d'items).
      const exists = await this.repo.findOne({
        where: { category: seed.category, type: seed.type },
      });
      if (!exists) {
        await this.repo.save(this.repo.create(seed));
      } else if (!exists.image && seed.image) {
        exists.image = seed.image;
        await this.repo.save(exists);
      }
    }
  }

  private async mergeLegacyWoodenStickItems(): Promise<void> {
    const canonical = await this.repo.findOne({
      where: {
        category: CANONICAL_WOODEN_STICK.category,
        type: CANONICAL_WOODEN_STICK.type,
      },
    });
    if (!canonical) return;

    const legacyItems = await this.repo.find({
      where: LEGACY_WOODEN_STICK_MATCH,
    });

    for (const legacy of legacyItems) {
      if (legacy.id === canonical.id) continue;
      await this.mergeLegacyWoodenStickItem(legacy, canonical);
    }
  }

  private async mergeLegacyWoodenStickItem(
    legacy: Item,
    canonical: Item,
  ): Promise<void> {
    const legacyRows = await this.inventoryRepo.find({
      where: { item: { id: legacy.id } },
      relations: ['character', 'item'],
    });

    for (const legacyRow of legacyRows) {
      const characterId = legacyRow.character?.id;
      if (!characterId) continue;

      const canonicalRow = await this.inventoryRepo.findOne({
        where: {
          character: { id: characterId },
          item: { id: canonical.id },
        },
        relations: ['character', 'item'],
      });

      if (canonicalRow && canonicalRow.id !== legacyRow.id) {
        canonicalRow.quantity += legacyRow.quantity;
        canonicalRow.equipped = canonicalRow.equipped || legacyRow.equipped;
        await this.inventoryRepo.save(canonicalRow);
        await this.inventoryRepo.remove(legacyRow);
      } else {
        legacyRow.item = canonical;
        await this.inventoryRepo.save(legacyRow);
      }
    }

    const remainingInventory = await this.inventoryRepo.count({
      where: { item: { id: legacy.id } },
    });
    const remainingEquipment = await this.equipmentRepo.count({
      where: { itemId: legacy.id },
    });

    if (remainingInventory === 0 && remainingEquipment === 0) {
      await this.repo.remove(legacy);
    }
  }

  async create(dto: CreateItemDto): Promise<Item> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(): Promise<Item[]> {
    return this.repo.find();
  }

  async findOne(id: string): Promise<Item> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) {
      throw new NotFoundException(`Item ${id} not found`);
    }
    return entity;
  }

  async update(id: string, dto: UpdateItemDto): Promise<Item> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
  }
}
