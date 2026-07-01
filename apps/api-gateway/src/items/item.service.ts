import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, In, Repository } from 'typeorm';
import { Item, ObjectMode } from './entities/item.entity';
import { EquipmentSlot } from '../characters/dto/equip-item.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Inventory } from '../inventory/entities/inventory.entity';
import { CharacterEquipment } from '../characters/entities/character-equipment.entity';
import { ResourceTemplate } from '../resources/entities/resource-template.entity';
import { CreatureTemplate } from '../creatures/entities/creature-template.entity';
import { CraftingIngredient } from '../crafting/entities/crafting-ingredient.entity';
import { CraftingResult } from '../crafting/entities/crafting-result.entity';
import { ItemInstance, ItemInstanceState } from '../item-instances/entities/item-instance.entity';
import { WorldItem, WorldItemState } from '../world-items/entities/world-item.entity';
import { AuctionListing, AuctionListingStatus } from '../auction/entities/auction-listing.entity';
import { MailMessage, MailStatus } from '../mail/entities/mail-message.entity';
import { Character } from '../characters/entities/character.entity';

/** Items de loot et de craft garantis présents en DB au démarrage. */
export const LOOT_ITEM_SEEDS: (Pick<
  Item,
  'name' | 'type' | 'category' | 'image' | 'objectMode'
> & Partial<Pick<Item, 'slot' | 'attack' | 'defense' | 'weaponType'>>)[] = [
  // ── Loot resources ───────────────────────────────────────────────────────
  {
    name: 'Bâton de bois',
    type: 'material',
    category: 'wooden_stick',
    image: '/assets/images/items/wooden_stick.png',
    objectMode: ObjectMode.STACKABLE,
  },
  {
    name: 'Minerai de fer',
    type: 'material',
    category: 'iron_ore',
    image: null,
    objectMode: ObjectMode.STACKABLE,
  },
  // ── Craft outputs (Phase 1) ───────────────────────────────────────────────
  {
    name: 'Lingot de fer',
    type: 'material',
    category: 'iron_bar',
    image: null,
    objectMode: ObjectMode.STACKABLE,
  },
  {
    name: 'Manche brut',
    type: 'material',
    category: 'basic_handle',
    image: null,
    objectMode: ObjectMode.STACKABLE,
  },
  {
    name: 'Lame brute',
    type: 'material',
    category: 'rough_blade',
    image: null,
    objectMode: ObjectMode.STACKABLE,
  },
  {
    name: 'Épée basique',
    type: 'weapon',
    category: 'basic_sword',
    image: null,
    objectMode: ObjectMode.INSTANCE,
    slot: EquipmentSlot.RIGHT_HAND,
    attack: 5,
    defense: 0,
    weaponType: 'two_handed_sword',
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

export interface ItemUsageStats {
  itemId: string;
  totalQuantityServer: number;
  inventoryEntries: number;
  uniqueCharacters: number;
  usedInResourceLootPools: Array<{ id: string; type: string }>;
  usedInCreatureLootPools: Array<{ id: number; key: string; name: string }>;
  usedInCraftRecipesOutput: Array<{ id: string; key: string; name: string }>;
  usedInCraftRecipesIngredient: Array<{
    id: string;
    key: string;
    name: string;
  }>;
}

export interface InventoryStackLine {
  id: string;
  characterId: string | null;
  characterName: string | null;
  quantity: number;
  equipped: boolean;
}

export interface ItemInstanceBreakdown {
  instanceType: string;
  state: string;
  containerType: string;
  count: number;
}

export interface ItemInstanceLine {
  id: string;
  instanceType: string;
  state: string;
  containerType: string;
  ownerId: string | null;
}

/** Nombre max d'instances individuelles listees dans le rapport (garde-fou payload). */
export const MAINTENANCE_INSTANCE_LINES_LIMIT = 100;

/**
 * Detail par categorie du compteur totalReferences.
 * Chaque categorie est une reference distincte au meme template :
 * une epee equipee peut compter a la fois en instance active ET en equipement.
 */
export interface ItemReferenceBreakdown {
  inventoryStacks: number;
  activeItemInstances: number;
  equipped: number;
  worldItems: number;
  auctionListings: number;
  mailAttachments: number;
  lootPoolRefs: number;
  recipeRefs: number;
}

export interface ItemMaintenanceReport {
  template: {
    id: string;
    name: string;
    type: string;
    category: string;
    objectMode: string;
    enabled: boolean;
  };
  inventory: {
    stackCount: number;
    stacks: InventoryStackLine[];
  };
  instances: {
    total: number;
    activeTotal: number; // hors DESTROYED/ARCHIVED
    breakdown: ItemInstanceBreakdown[];
    lines: ItemInstanceLine[]; // instances actives individuelles (limitees)
    linesTruncated: boolean;
  };
  equippedCount: number;
  worldItemsCount: number;
  auctionListingsCount: number;
  attachedMailsCount: number;
  references: ItemReferenceBreakdown; // detail par categorie de totalReferences
  totalReferences: number; // 0 => template supprimable
}

@Injectable()
export class ItemService implements OnModuleInit {
  constructor(
    @InjectRepository(Item)
    private readonly repo: Repository<Item>,
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    @InjectRepository(CharacterEquipment)
    private readonly equipmentRepo: Repository<CharacterEquipment>,
    @InjectRepository(ResourceTemplate)
    private readonly resourceTemplateRepo: Repository<ResourceTemplate>,
    @InjectRepository(CreatureTemplate)
    private readonly creatureTemplateRepo: Repository<CreatureTemplate>,
    @InjectRepository(CraftingIngredient)
    private readonly craftingIngredientRepo: Repository<CraftingIngredient>,
    @InjectRepository(CraftingResult)
    private readonly craftingResultRepo: Repository<CraftingResult>,
    @InjectRepository(ItemInstance)
    private readonly instanceRepo: Repository<ItemInstance>,
    @InjectRepository(WorldItem)
    private readonly worldItemRepo: Repository<WorldItem>,
    @InjectRepository(AuctionListing)
    private readonly auctionListingRepo: Repository<AuctionListing>,
    @InjectRepository(MailMessage)
    private readonly mailMessageRepo: Repository<MailMessage>,
    @InjectRepository(Character)
    private readonly characterRepo: Repository<Character>,
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
      } else {
        let dirty = false;
        if (!exists.image && seed.image) { exists.image = seed.image; dirty = true; }
        if (exists.objectMode !== seed.objectMode) { exists.objectMode = seed.objectMode; dirty = true; }
        if (seed.slot !== undefined && exists.slot !== seed.slot) { exists.slot = seed.slot; dirty = true; }
        if (seed.attack !== undefined && exists.attack !== seed.attack) { exists.attack = seed.attack; dirty = true; }
        if (seed.defense !== undefined && exists.defense !== seed.defense) { exists.defense = seed.defense; dirty = true; }
        if (seed.weaponType !== undefined && exists.weaponType !== seed.weaponType) { exists.weaponType = seed.weaponType; dirty = true; }
        if (dirty) await this.repo.save(exists);
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
    if (dto.objectMode !== undefined && dto.objectMode !== entity.objectMode) {
      await this.assertObjectModeChangeable(id);
    }
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  /**
   * Centralise toutes les validations empêchant une migration d'objectMode.
   * Lève ConflictException si au moins une référence active existe.
   *
   * Tables couvertes : item_instance (instances non-terminales), inventory (stacks),
   * character_equipment (équipement legacy direct par itemId).
   *
   * Toute nouvelle table contenant une référence active vers Item
   * (vendor_item, quest_reward, crafting_recipe_ingredient, loot_pool_item, etc.)
   * devra être ajoutée ici.
   */
  private async assertObjectModeChangeable(itemId: string): Promise<void> {
    const [instances, stacks, equipped] = await Promise.all([
      this.instanceRepo.count({
        where: { itemId, state: Not(In([ItemInstanceState.DESTROYED, ItemInstanceState.ARCHIVED])) },
      }),
      this.inventoryRepo.count({ where: { item: { id: itemId } } }),
      this.equipmentRepo.count({ where: { itemId } }),
    ]);
    if (instances > 0 || stacks > 0 || equipped > 0) {
      throw new ConflictException(
        'Cannot change objectMode of an item already used by runtime data.',
      );
    }
  }

  async getUsageStats(id: string): Promise<ItemUsageStats> {
    const item = await this.findOne(id);
    const lootRefs = this.buildLootPoolRefs(item);

    const [
      inventory,
      resourceLootPools,
      creatureLootPools,
      craftOutputs,
      craftIngredients,
    ] = await Promise.all([
      this.getInventoryUsage(id),
      this.findResourceLootPoolUsage(lootRefs),
      this.findCreatureLootPoolUsage(lootRefs),
      this.findCraftOutputUsage(id),
      this.findCraftIngredientUsage(id),
    ]);

    return {
      itemId: item.id,
      totalQuantityServer: inventory.totalQuantityServer,
      inventoryEntries: inventory.inventoryEntries,
      uniqueCharacters: inventory.uniqueCharacters,
      usedInResourceLootPools: resourceLootPools,
      usedInCreatureLootPools: creatureLootPools,
      usedInCraftRecipesOutput: craftOutputs,
      usedInCraftRecipesIngredient: craftIngredients,
    };
  }

  private buildLootPoolRefs(item: Item): string[] {
    return Array.from(new Set([item.category, item.id].filter(Boolean)));
  }

  private async getInventoryUsage(itemId: string): Promise<{
    totalQuantityServer: number;
    inventoryEntries: number;
    uniqueCharacters: number;
  }> {
    const row = await this.inventoryRepo
      .createQueryBuilder('inventory')
      .select('COALESCE(SUM(inventory.quantity), 0)', 'totalQuantityServer')
      .addSelect('COUNT(inventory.id)', 'inventoryEntries')
      .addSelect('COUNT(DISTINCT inventory."characterId")', 'uniqueCharacters')
      .where('inventory."itemId" = :itemId', { itemId })
      .getRawOne<{
        totalQuantityServer: string;
        inventoryEntries: string;
        uniqueCharacters: string;
      }>();

    return {
      totalQuantityServer: Number(row?.totalQuantityServer ?? 0),
      inventoryEntries: Number(row?.inventoryEntries ?? 0),
      uniqueCharacters: Number(row?.uniqueCharacters ?? 0),
    };
  }

  private buildLootPoolWhere(
    alias: string,
    refs: string[],
  ): { where: string; params: Record<string, string> } {
    const params: Record<string, string> = {};
    const parts = refs.map((ref, index) => {
      const key = `lootRef${index}`;
      params[key] = JSON.stringify([{ itemId: ref }]);
      return `${alias}.lootPool @> CAST(:${key} AS jsonb)`;
    });

    return {
      where: parts.length > 0 ? `(${parts.join(' OR ')})` : 'FALSE',
      params,
    };
  }

  private async findResourceLootPoolUsage(
    refs: string[],
  ): Promise<Array<{ id: string; type: string }>> {
    const { where, params } = this.buildLootPoolWhere('template', refs);
    return this.resourceTemplateRepo
      .createQueryBuilder('template')
      .select(['template.id', 'template.type'])
      .where(where, params)
      .orderBy('template.type', 'ASC')
      .getMany();
  }

  private async findCreatureLootPoolUsage(
    refs: string[],
  ): Promise<Array<{ id: number; key: string; name: string }>> {
    const { where, params } = this.buildLootPoolWhere('template', refs);
    return this.creatureTemplateRepo
      .createQueryBuilder('template')
      .select(['template.id', 'template.key', 'template.name'])
      .where(where, params)
      .orderBy('template.key', 'ASC')
      .getMany();
  }

  private async findCraftOutputUsage(
    itemId: string,
  ): Promise<Array<{ id: string; key: string; name: string }>> {
    const rows = await this.craftingResultRepo
      .createQueryBuilder('result')
      .innerJoin('result.recipe', 'recipe')
      .select('recipe.id', 'id')
      .addSelect('recipe.key', 'key')
      .addSelect('recipe.name', 'name')
      .where('result.itemId = :itemId', { itemId })
      .orderBy('recipe.key', 'ASC')
      .getRawMany<{ id: string; key: string; name: string }>();

    return this.dedupeRecipeRows(rows);
  }

  private async findCraftIngredientUsage(
    itemId: string,
  ): Promise<Array<{ id: string; key: string; name: string }>> {
    const rows = await this.craftingIngredientRepo
      .createQueryBuilder('ingredient')
      .innerJoin('ingredient.recipe', 'recipe')
      .select('recipe.id', 'id')
      .addSelect('recipe.key', 'key')
      .addSelect('recipe.name', 'name')
      .where('ingredient.itemId = :itemId', { itemId })
      .orderBy('recipe.key', 'ASC')
      .getRawMany<{ id: string; key: string; name: string }>();

    return this.dedupeRecipeRows(rows);
  }

  private dedupeRecipeRows(
    rows: Array<{ id: string; key: string; name: string }>,
  ): Array<{ id: string; key: string; name: string }> {
    const byId = new Map<string, { id: string; key: string; name: string }>();
    for (const row of rows) {
      byId.set(row.id, row);
    }
    return Array.from(byId.values());
  }

  // ---------------------------------------------------------------------------
  // Maintenance DevTools
  // ---------------------------------------------------------------------------

  /**
   * Rapport complet des references d'un item a travers tous les domaines.
   * Sert de base a toutes les operations de maintenance (suppression stack,
   * destruction instance, desactivation/suppression template).
   */
  async getMaintenanceReport(itemId: string): Promise<ItemMaintenanceReport> {
    const item = await this.findOne(itemId);

    const [
      stacks,
      instanceRows,
      instanceLines,
      equippedCount,
      worldItemsCount,
      auctionListingsCount,
      attachedMailsCount,
      usageStats,
    ] = await Promise.all([
      this.getInventoryStackLines(itemId),
      this.getInstanceBreakdown(itemId),
      this.getActiveInstanceLines(itemId),
      this.equipmentRepo.count({ where: { itemId } }),
      this.worldItemRepo.count({
        where: { itemId, state: In([WorldItemState.SPAWNED]) },
      }),
      this.countActiveAuctionListings(itemId),
      this.countAttachedMails(itemId),
      this.getUsageStats(itemId),
    ]);

    const instancesTotal = instanceRows.reduce((sum, r) => sum + r.count, 0);
    const terminalStates: string[] = [
      ItemInstanceState.DESTROYED,
      ItemInstanceState.ARCHIVED,
    ];
    const activeInstances = instanceRows
      .filter((r) => !terminalStates.includes(r.state))
      .reduce((sum, r) => sum + r.count, 0);

    const references: ItemReferenceBreakdown = {
      inventoryStacks: stacks.length,
      activeItemInstances: activeInstances,
      equipped: equippedCount,
      worldItems: worldItemsCount,
      auctionListings: auctionListingsCount,
      mailAttachments: attachedMailsCount,
      lootPoolRefs:
        usageStats.usedInResourceLootPools.length +
        usageStats.usedInCreatureLootPools.length,
      recipeRefs:
        usageStats.usedInCraftRecipesOutput.length +
        usageStats.usedInCraftRecipesIngredient.length,
    };

    const totalReferences =
      references.inventoryStacks +
      references.activeItemInstances +
      references.equipped +
      references.worldItems +
      references.auctionListings +
      references.mailAttachments +
      references.lootPoolRefs +
      references.recipeRefs;

    return {
      template: {
        id: item.id,
        name: item.name,
        type: item.type,
        category: item.category,
        objectMode: item.objectMode,
        enabled: item.enabled,
      },
      inventory: { stackCount: stacks.length, stacks },
      instances: {
        total: instancesTotal,
        activeTotal: activeInstances,
        breakdown: instanceRows,
        lines: instanceLines,
        linesTruncated: instanceLines.length >= MAINTENANCE_INSTANCE_LINES_LIMIT,
      },
      equippedCount,
      worldItemsCount,
      auctionListingsCount,
      attachedMailsCount,
      references,
      totalReferences,
    };
  }

  private async getInventoryStackLines(itemId: string): Promise<InventoryStackLine[]> {
    const rows = await this.inventoryRepo
      .createQueryBuilder('inv')
      .leftJoin('inv.character', 'character')
      .select('inv.id', 'id')
      .addSelect('inv.quantity', 'quantity')
      .addSelect('inv.equipped', 'equipped')
      .addSelect('character.id', 'characterId')
      .addSelect('character.name', 'characterName')
      .where('inv."itemId" = :itemId', { itemId })
      .orderBy('character.name', 'ASC')
      .getRawMany<{
        id: string;
        quantity: number;
        equipped: boolean;
        characterId: string | null;
        characterName: string | null;
      }>();

    return rows.map((r) => ({
      id: r.id,
      characterId: r.characterId ?? null,
      characterName: r.characterName ?? null,
      quantity: Number(r.quantity),
      equipped: Boolean(r.equipped),
    }));
  }

  private async getInstanceBreakdown(itemId: string): Promise<ItemInstanceBreakdown[]> {
    const rows = await this.instanceRepo
      .createQueryBuilder('inst')
      .select('inst.instanceType', 'instanceType')
      .addSelect('inst.state', 'state')
      .addSelect('inst.containerType', 'containerType')
      .addSelect('COUNT(inst.id)', 'count')
      .where('inst.itemId = :itemId', { itemId })
      .groupBy('inst.instanceType')
      .addGroupBy('inst.state')
      .addGroupBy('inst.containerType')
      .orderBy('inst.instanceType', 'ASC')
      .addOrderBy('inst.state', 'ASC')
      .getRawMany<{ instanceType: string; state: string; containerType: string; count: string }>();

    return rows.map((r) => ({
      instanceType: r.instanceType,
      state: r.state,
      containerType: r.containerType,
      count: Number(r.count),
    }));
  }

  private async getActiveInstanceLines(itemId: string): Promise<ItemInstanceLine[]> {
    const rows = await this.instanceRepo
      .createQueryBuilder('inst')
      .select(['inst.id', 'inst.instanceType', 'inst.state', 'inst.containerType', 'inst.ownerId'])
      .where('inst.itemId = :itemId', { itemId })
      .andWhere('inst.state NOT IN (:...terminal)', {
        terminal: [ItemInstanceState.DESTROYED, ItemInstanceState.ARCHIVED],
      })
      .orderBy('inst.updatedAt', 'DESC')
      .take(MAINTENANCE_INSTANCE_LINES_LIMIT)
      .getMany();

    return rows.map((r) => ({
      id: r.id,
      instanceType: r.instanceType,
      state: r.state,
      containerType: r.containerType,
      ownerId: r.ownerId ?? null,
    }));
  }

  private async countActiveAuctionListings(itemId: string): Promise<number> {
    const terminal: string[] = [
      AuctionListingStatus.SOLD_CLAIMED,
      AuctionListingStatus.EXPIRED_CLAIMED,
      AuctionListingStatus.CANCELLED_CLAIMED,
      AuctionListingStatus.ARCHIVED,
    ];
    return this.auctionListingRepo
      .createQueryBuilder('listing')
      .where('listing.itemId = :itemId', { itemId })
      .andWhere('listing.status NOT IN (:...terminal)', { terminal })
      .getCount();
  }

  private async countAttachedMails(itemId: string): Promise<number> {
    // item_instance.id est uuid, mail_message.attachedItemInstanceId est varchar.
    // Cast explicite ::text pour eviter "operator does not exist: uuid = character varying".
    return this.mailMessageRepo
      .createQueryBuilder('mail')
      .innerJoin(ItemInstance, 'inst', 'inst.id::text = mail."attachedItemInstanceId"')
      .where('inst.itemId = :itemId', { itemId })
      .andWhere('mail.status = :status', { status: MailStatus.PENDING })
      .getCount();
  }

  /**
   * Supprime une ligne inventory precise (nettoyage stack legacy).
   * Refuse si equipped=true. Transaction. Retourne le characterId proprietaire
   * pour permettre a l'appelant d'emettre character:reload.
   */
  async deleteInventoryStack(inventoryId: string): Promise<{ characterId: string | null; itemName: string }> {
    return this.repo.manager.transaction(async (manager) => {
      // Verrou pessimiste sur la seule ligne inventory. Postgres interdit
      // FOR UPDATE combine a un LEFT JOIN ("cannot be applied to the nullable
      // side of an outer join"), donc on ne joint pas ici : les relations
      // character/item sont chargees separement apres le verrou.
      const row = await manager
        .getRepository(Inventory)
        .createQueryBuilder('inv')
        .setLock('pessimistic_write')
        .where('inv.id = :inventoryId', { inventoryId })
        .getOne();

      if (!row) throw new NotFoundException(`Stack inventory ${inventoryId} introuvable.`);
      if (row.equipped) {
        throw new BadRequestException('Stack equipe : desequiper avant suppression.');
      }

      const detailed = await manager.getRepository(Inventory).findOne({
        where: { id: inventoryId },
        relations: ['character', 'item'],
      });
      const characterId = detailed?.character?.id ?? null;
      const itemName = detailed?.item?.name ?? 'inconnu';

      await manager.remove(Inventory, row);
      return { characterId, itemName };
    });
  }

  /**
   * Desactive un template (enabled=false). Ne supprime jamais physiquement.
   */
  async disableItemTemplate(itemId: string): Promise<Item> {
    const item = await this.findOne(itemId);
    if (!item.enabled) return item;
    item.enabled = false;
    return this.repo.save(item);
  }

  /**
   * Supprime physiquement un template UNIQUEMENT si zero reference partout.
   * Sinon leve BadRequestException detaillant les references bloquantes.
   */
  async deleteItemTemplate(itemId: string): Promise<{ name: string }> {
    const report = await this.getMaintenanceReport(itemId);
    if (report.totalReferences > 0) {
      const parts: string[] = [];
      if (report.inventory.stackCount > 0) parts.push(`${report.inventory.stackCount} stack(s) inventory`);
      if (report.instances.activeTotal > 0) parts.push(`${report.instances.activeTotal} instance(s) active(s)`);
      if (report.equippedCount > 0) parts.push(`${report.equippedCount} equipement(s)`);
      if (report.worldItemsCount > 0) parts.push(`${report.worldItemsCount} objet(s) au sol`);
      if (report.auctionListingsCount > 0) parts.push(`${report.auctionListingsCount} vente(s) auction`);
      if (report.attachedMailsCount > 0) parts.push(`${report.attachedMailsCount} mail(s) attache(s)`);
      throw new ConflictException(
        `Template reference (${parts.join(', ')}) : suppression interdite. Nettoyer les references d'abord.`,
      );
    }
    const item = await this.findOne(itemId);
    const name = item.name;
    await this.repo.remove(item);
    return { name };
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
  }
}
