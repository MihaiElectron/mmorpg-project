import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Character } from './entities/character.entity';
import { CharacterEquipment } from './entities/character-equipment.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { Item, ObjectMode } from '../items/entities/item.entity';
import { CreateCharacterDto } from './dto/create-character.dto';
import { EquipItemDto, EquipmentSlot } from './dto/equip-item.dto';
import { UnequipItemDto } from './dto/unequip-item.dto';
import { isoScreenToWorldWU, DEFAULT_MAP_ID } from '../common/world-coordinates';
import { recalculateEquipmentStats } from './equipment-stats.helper';
import { InventoryProjectionService } from '../inventory/projection/inventory-projection.service';
import { InventoryEntryDto } from '../inventory/projection/inventory-entry.dto';
import { ItemInstance } from '../item-instances/entities/item-instance.entity';
import { ItemTransferService } from '../item-transfer/item-transfer.service';
import { ProgressionService } from '../progression/progression.service';
import { CharacterStatsCalculator, PrimaryStats, DerivedStats } from './character-stats-calculator';
import { resolveEffectiveAttackRangeWU } from './attack-range.helper';
import { AllocateStatsDto } from './dto/allocate-stats.dto';
import { PreviewStatsDto } from './dto/preview-stats.dto';
import { WorldService } from '../world/world.service';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';

// Correspondance stat DTO → colonne base* de Character.
const STAT_COLUMN: Record<keyof AllocateStatsDto, keyof Character> = {
  strength: 'baseStrength',
  vitality: 'baseVitality',
  endurance: 'baseEndurance',
  agility: 'baseAgility',
  dexterity: 'baseDexterity',
  intelligence: 'baseIntelligence',
  wisdom: 'baseWisdom',
  spirit: 'baseSpirit',
  willpower: 'baseWillpower',
  charisma: 'baseCharisma',
};

// Position isométrique de spawn par défaut (positionX=400, positionY=300 → entity defaults).
// WU calculés une fois : worldX=0, worldY=9600.
const DEFAULT_SPAWN_PX = { x: 400, y: 300 } as const;
const DEFAULT_SPAWN_WU = isoScreenToWorldWU(DEFAULT_SPAWN_PX.x, DEFAULT_SPAWN_PX.y);

@Injectable()
export class CharacterService {
  constructor(
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
    @InjectRepository(CharacterEquipment)
    private readonly equipmentRepository: Repository<CharacterEquipment>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    private readonly dataSource: DataSource,
    private readonly inventoryProjection: InventoryProjectionService,
    private readonly itemTransfer: ItemTransferService,
    private readonly progression: ProgressionService,
    private readonly worldService: WorldService,
    private readonly derivedStats: DerivedStatsService,
  ) {}

  /**
   * Crée un nouveau personnage pour un utilisateur
   */
  async create(userId: string, dto: CreateCharacterDto): Promise<Character> {
    const character = this.characterRepository.create({
      name: dto.name,
      sex: dto.sex,
      userId,
      worldX: DEFAULT_SPAWN_WU.worldX,
      worldY: DEFAULT_SPAWN_WU.worldY,
      mapId: DEFAULT_MAP_ID,
    });
    return this.characterRepository.save(character);
  }

  /**
   * Récupère tous les personnages d'un utilisateur
   */
  async findAllByUser(userId: string): Promise<Character[]> {
    return this.characterRepository.find({
      where: { userId },
      relations: ['equipment', 'equipment.item', 'inventory', 'inventory.item'],
    });
  }

  /**
   * Récupère le "premier" personnage d'un utilisateur (pour /characters/me)
   */
  async findFirstByUser(userId: string): Promise<Character> {
    const character = await this.characterRepository.findOne({
      where: { userId },
      relations: ['equipment', 'equipment.item', 'inventory', 'inventory.item'],
      order: { createdAt: 'ASC' },
    });

    if (!character)
      throw new NotFoundException(`No character found for user ${userId}`);
    return character;
  }

  async findFirstByUserProjected(
    userId: string,
  ): Promise<Omit<Character, 'inventory'> & { inventory: InventoryEntryDto[] }> {
    const character = await this.characterRepository.findOne({
      where: { userId },
      relations: ['equipment', 'equipment.item'],
      order: { createdAt: 'ASC' },
    });
    if (!character) throw new NotFoundException(`No character found for user ${userId}`);
    const inventory = await this.inventoryProjection.project(character.id);
    const nextLevelXp = await this.progression.getNextLevelXp(character.level);
    const derivedStatDefinitions = await this.derivedStats.getDefinitions();
    const stats = CharacterStatsCalculator.compute(character, derivedStatDefinitions);
    // Bloc combat séparé de stats.derived : portée effective issue de
    // l'équipement + règles combat (source serveur unique pour l'auto-attaque).
    const combat = { attackRangeWU: resolveEffectiveAttackRangeWU(character.equipment) };
    return Object.assign(character, { inventory, nextLevelXp, stats, combat });
  }

  /**
   * Alloue des points de stats permanents (Progression V1).
   * - Le personnage ciblé est TOUJOURS celui de l'utilisateur connecté
   *   (jamais un characterId arbitraire fourni par le client).
   * - Transaction + verrou pessimiste : la somme allouée est validée contre
   *   `unspentStatPoints` sous verrou, empêchant toute sur-allocation concurrente.
   * - Vitalité : les PV courants montent du delta de PV max dérivé (capés).
   * Renvoie le MÊME format enrichi que GET /characters/me.
   */
  async allocateStats(
    userId: string,
    dto: AllocateStatsDto,
  ): Promise<Omit<Character, 'inventory'> & { inventory: InventoryEntryDto[] }> {
    // Normalise et valide les incréments (entiers >= 0, somme > 0).
    const increments: Partial<Record<keyof Character, number>> = {};
    let total = 0;
    for (const key of Object.keys(STAT_COLUMN) as (keyof AllocateStatsDto)[]) {
      const raw = dto[key];
      if (raw === undefined) continue;
      if (!Number.isInteger(raw) || raw < 0) {
        throw new BadRequestException(`Valeur invalide pour "${key}" : entier >= 0 requis.`);
      }
      if (raw === 0) continue;
      increments[STAT_COLUMN[key]] = raw;
      total += raw;
    }
    if (total <= 0) {
      throw new BadRequestException('Aucun point à allouer.');
    }

    const derivedStatDefinitions = await this.derivedStats.getDefinitions();

    const characterId = await this.dataSource.transaction(async (manager) => {
      const character = await manager.findOne(Character, {
        where: { userId },
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!character) throw new NotFoundException(`No character found for user ${userId}`);

      if (total > character.unspentStatPoints) {
        throw new BadRequestException(
          `Points insuffisants : ${total} demandés, ${character.unspentStatPoints} disponibles.`,
        );
      }

      // PV max dérivé avant application (pour le delta Vitalité).
      const oldMaxHealth = CharacterStatsCalculator.compute(character, derivedStatDefinitions).derived.maxHealth;

      for (const [column, amount] of Object.entries(increments)) {
        (character as unknown as Record<string, number>)[column] += amount as number;
      }
      character.unspentStatPoints -= total;

      // Vitalité : PV courants +delta, capés au nouveau PV max dérivé.
      const newMaxHealth = CharacterStatsCalculator.compute(character, derivedStatDefinitions).derived.maxHealth;
      const delta = newMaxHealth - oldMaxHealth;
      if (delta > 0) {
        character.health = Math.min(character.health + delta, newMaxHealth);
      }

      await manager.save(Character, character);
      return character.id;
    });

    // Notifie le client connecté et renvoie le format enrichi unique.
    this.worldService.emitCharacterReload(characterId);
    this.worldService.emitAdminCharacterDirty(characterId, 'stats');
    return this.findFirstByUserProjected(userId);
  }

  /**
   * Prévisualisation (LECTURE SEULE) de l'impact d'une répartition de points de
   * stats primaires, AVANT validation. Ne persiste RIEN.
   *
   * `draftPrimaryStats` = valeurs finales souhaitées des 10 primaires (base
   * permanente + points en cours). Le serveur reste autorité : il refuse les
   * clés inconnues, les valeurs non entières/négatives, une valeur inférieure
   * à la base déjà acquise (dé-allocation interdite) et un total ajouté
   * supérieur aux `unspentStatPoints`. Le calcul réutilise
   * `CharacterStatsCalculator` (aucune formule dupliquée) sur un clone en
   * mémoire — la ligne DB n'est jamais modifiée.
   */
  async previewStats(
    userId: string,
    dto: PreviewStatsDto,
  ): Promise<{ primary: PrimaryStats; derived: DerivedStats }> {
    const character = await this.characterRepository.findOne({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    if (!character) throw new NotFoundException(`No character found for user ${userId}`);

    const draft = dto?.draftPrimaryStats ?? {};
    const tempChar = { ...character } as Character;
    const tempRecord = tempChar as unknown as Record<string, number>;
    const charRecord = character as unknown as Record<string, number>;

    let totalAdded = 0;
    for (const [key, value] of Object.entries(draft)) {
      if (!(key in STAT_COLUMN)) {
        throw new BadRequestException(`Stat primaire inconnue : "${key}".`);
      }
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new BadRequestException(`Valeur invalide pour "${key}" : entier >= 0 requis.`);
      }
      const column = STAT_COLUMN[key as keyof AllocateStatsDto];
      const baseVal = charRecord[column] ?? 0;
      if (value < baseVal) {
        throw new BadRequestException(
          `"${key}" ne peut pas passer sous sa base permanente (${baseVal}).`,
        );
      }
      totalAdded += value - baseVal;
      tempRecord[column] = value;
    }

    if (totalAdded > character.unspentStatPoints) {
      throw new BadRequestException(
        `Points insuffisants : ${totalAdded} demandés, ${character.unspentStatPoints} disponibles.`,
      );
    }

    const definitions = await this.derivedStats.getDefinitions();
    const stats = CharacterStatsCalculator.compute(tempChar, definitions);
    return { primary: stats.final, derived: stats.derived };
  }

  /**
   * Récupère un personnage par son ID (vérifie la propriété)
   */
  async findOne(id: string, userId: string): Promise<Character> {
    const character = await this.characterRepository.findOne({
      where: { id, userId },
      relations: ['equipment', 'equipment.item', 'inventory', 'inventory.item'],
    });
    if (!character) throw new NotFoundException(`Character ${id} not found`);
    return character;
  }

  /**
   * Équipe un item sur un personnage
   */
  async equipItem(
    characterId: string,
    userId: string,
    dto: EquipItemDto,
  ): Promise<Character> {
    // Valide que l'utilisateur a bien un personnage avant d'equiper l'item.
    const character = await this.findFirstByUser(userId);
    void character;

    const item = await this.itemRepository.findOne({
      where: { id: dto.itemId },
    });
    if (!item) throw new NotFoundException(`Item ${dto.itemId} not found`);
    // Un item INSTANCE ne doit jamais passer par le chemin legacy (par itemId) :
    // il créerait un CharacterEquipment sans itemInstanceId et laisserait
    // l'ItemInstance non transitionnée (desync EQUIPPED/AVAILABLE).
    if (item.objectMode === ObjectMode.INSTANCE) {
      throw new BadRequestException(
        'Cet item est de type INSTANCE : utiliser equip-instance (POST /inventory/:characterId/equip-instance/:instanceId).',
      );
    }

    let finalSlot: EquipmentSlot;
    if (dto.slot) {
      finalSlot = dto.slot;
      if (item.slot && item.slot !== finalSlot)
        throw new BadRequestException(
          `Item slot (${item.slot}) does not match requested slot (${finalSlot})`,
        );
    } else {
      if (
        item.slot === EquipmentSlot.LEFT_EARRING ||
        item.slot === EquipmentSlot.RIGHT_EARRING
      ) {
        const left = await this.equipmentRepository.findOne({
          where: { characterId, slot: EquipmentSlot.LEFT_EARRING },
        });
        const right = await this.equipmentRepository.findOne({
          where: { characterId, slot: EquipmentSlot.RIGHT_EARRING },
        });
        finalSlot = !left
          ? EquipmentSlot.LEFT_EARRING
          : !right
            ? EquipmentSlot.RIGHT_EARRING
            : EquipmentSlot.LEFT_EARRING;
      } else {
        if (!item.slot)
          throw new BadRequestException('Slot is required for this item');
        finalSlot = item.slot;
      }
    }

    const result = await this.dataSource.transaction(async (manager) => {
      // 1. Récupérer l'item actuellement équipé dans CE slot (s'il existe)
      const currentlyEquipped = await manager
        .createQueryBuilder(CharacterEquipment, 'eq')
        .leftJoinAndSelect('eq.item', 'item')
        .where('eq.characterId = :characterId', { characterId })
        .andWhere('eq.slot = :slot', { slot: finalSlot })
        .getOne();

      // 2. Supprimer l'ancien équipement
      await manager.delete(CharacterEquipment, {
        characterId,
        slot: finalSlot,
      });

      // 3. Mettre à jour inventory.equipped = false pour l'ANCIEN item équipé (s'il y en avait un)
      if (currentlyEquipped) {
        const oldInventoryEntry = await manager.findOne(Inventory, {
          where: {
            character: { id: characterId },
            item: { id: currentlyEquipped.item.id },
          },
        });
        if (oldInventoryEntry) {
          oldInventoryEntry.equipped = false;
          await manager.save(Inventory, oldInventoryEntry);
        }
      }

      // 4. Créer le nouvel équipement
      const equipment = manager.create(CharacterEquipment, {
        characterId,
        itemId: item.id,
        slot: finalSlot,
      });
      await manager.save(CharacterEquipment, equipment);

      // 5. Mettre à jour inventory.equipped = true pour le NOUVEL item
      const inventoryEntry = await manager.findOne(Inventory, {
        where: { character: { id: characterId }, item: { id: item.id } },
      });
      if (inventoryEntry) {
        inventoryEntry.equipped = true;
        await manager.save(Inventory, inventoryEntry);
      }

      await this.recalculateStats(characterId, manager);

      const updatedCharacter = await manager.findOne(Character, {
        where: { id: characterId },
        relations: [
          'equipment',
          'equipment.item',
          'inventory',
          'inventory.item',
        ],
      });
      if (!updatedCharacter)
        throw new NotFoundException(`Character ${characterId} not found`);
      return updatedCharacter;
    });
    this.worldService.emitAdminCharacterDirty(characterId, 'equipment');
    return result;
  }

  /**
   * Déséquipe un item
   * - D'abord récupère l'item équipé via character_equipment
   * - Puis met à jour inventory.equipped = false pour CET item
   */
  async unequipItem(
    characterId: string,
    userId: string,
    dto: UnequipItemDto,
  ): Promise<Character> {
    await this.findOne(characterId, userId);

    const result = await this.dataSource.transaction(async (manager) => {
      // 1. Récupérer l'item équipé dans CE slot
      const equippedItem = await manager
        .createQueryBuilder(CharacterEquipment, 'eq')
        .leftJoinAndSelect('eq.item', 'item')
        .where('eq.characterId = :characterId', { characterId })
        .andWhere('eq.slot = :slot', { slot: dto.slot })
        .getOne();

      if (!equippedItem) {
        throw new NotFoundException(`No item equipped in slot ${dto.slot}`);
      }

      // 2. Supprimer de CharacterEquipment
      await manager.delete(CharacterEquipment, { characterId, slot: dto.slot });

      // 3a. Chemin INSTANCE : retransitionner l'ItemInstance vers AVAILABLE/INVENTORY
      if (equippedItem.itemInstanceId) {
        await this.itemTransfer.transfer(manager, equippedItem.itemInstanceId, {
          requesterId: characterId,
          transition: { type: 'UNEQUIP', characterId },
        });
      } else {
        // 3b. Chemin legacy stack : mettre à jour Inventory.equipped = false
        const inventoryEntry = await manager
          .createQueryBuilder(Inventory, 'inv')
          .leftJoinAndSelect('inv.character', 'character')
          .leftJoinAndSelect('inv.item', 'item')
          .where('character.id = :characterId', { characterId })
          .andWhere('item.id = :itemId', { itemId: equippedItem.item.id })
          .getOne();

        if (inventoryEntry) {
          inventoryEntry.equipped = false;
          await manager.save(Inventory, inventoryEntry);
        }
      }

      await this.recalculateStats(characterId, manager);

      const updatedCharacter = await manager.findOne(Character, {
        where: { id: characterId },
        relations: [
          'equipment',
          'equipment.item',
          'inventory',
          'inventory.item',
        ],
      });
      if (!updatedCharacter)
        throw new NotFoundException(`Character ${characterId} not found`);
      return updatedCharacter;
    });
    this.worldService.emitAdminCharacterDirty(characterId, 'equipment');
    return result;
  }

  private async recalculateStats(
    characterId: string,
    manager: EntityManager,
  ): Promise<void> {
    await recalculateEquipmentStats(manager, characterId);
  }

  /**
   * Supprime un personnage
   */
  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id, userId);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(CharacterEquipment, { characterId: id });
      await manager
        .createQueryBuilder()
        .delete()
        .from(Inventory)
        .where('"characterId" = :id', { id })
        .execute();
      await manager.delete(Character, { id, userId });
    });
  }
}
