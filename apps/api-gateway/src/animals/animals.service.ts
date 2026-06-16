import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Animal } from './entities/animal.entity';
import { Character } from '../characters/entities/character.entity';
import { EquipmentSlot } from '../characters/dto/equip-item.dto';

// Portées par défaut quand l'item équipé ne définit pas la sienne.
const MELEE_RANGE = 60;
const RANGED_RANGE_DEFAULT = 300;

// Un personnage ne peut attaquer qu'une fois toutes les X ms (anti-spam).
const ATTACK_COOLDOWN_MS = 700;

export type AttackSuccess = {
  success: true;
  animal: Animal;
  damage: number;
  attackerId: string;
  riposte?: { damage: number; characterHealth: number };
};
export type AttackFailure = { success: false; error: string };
export type AttackResult = AttackSuccess | AttackFailure;

/**
 * Type guard explicite : avec `strictNullChecks` désactivé dans ce projet,
 * TypeScript ne sait pas affiner `AttackResult` via `if (!result.success)`.
 */
export function isAttackFailure(result: AttackResult): result is AttackFailure {
  return result.success === false;
}

@Injectable()
export class AnimalsService implements OnModuleInit {
  /**
   * Dernière attaque par personnage, pour appliquer le cooldown serveur.
   */
  private readonly lastAttackAt = new Map<string, number>();

  constructor(
    @InjectRepository(Animal)
    private readonly animalRepository: Repository<Animal>,
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
  ) {}

  async onModuleInit() {
    await this.seedTurkey();
  }

  findAll() {
    return this.animalRepository.find();
  }

  findOne(id: string) {
    return this.animalRepository.findOne({ where: { id } });
  }

  async attack(
    id: string,
    characterId: string,
    attackerPosition: { x: number; y: number },
  ): Promise<AttackResult> {
    const now = Date.now();
    const lastAttack = this.lastAttackAt.get(characterId) ?? 0;
    if (now - lastAttack < ATTACK_COOLDOWN_MS) {
      return { success: false, error: 'Attack on cooldown' };
    }

    const animal = await this.findOne(id);
    if (!animal) return { success: false, error: 'Animal not found' };
    if (animal.state === 'dead') {
      return { success: false, error: 'Animal already dead' };
    }

    const character = await this.characterRepository.findOne({
      where: { id: characterId },
      relations: ['equipment', 'equipment.item'],
    });
    if (!character) return { success: false, error: 'Character not found' };
    if (character.health <= 0) {
      return { success: false, error: 'Character is dead' };
    }

    const range = this.resolveAttackRange(character);
    const distance = Math.hypot(
      animal.x - attackerPosition.x,
      animal.y - attackerPosition.y,
    );
    if (distance > range) {
      return { success: false, error: 'Target out of range' };
    }

    this.lastAttackAt.set(characterId, now);

    const attack = Math.max(character.attack, 5);
    const damage = Math.max(attack - animal.armor, 1);

    animal.health = Math.max(animal.health - damage, 0);
    animal.state = animal.health === 0 ? 'dead' : 'alive';

    const saved = await this.animalRepository.save(animal);

    // L'animal ne riposte qu'au corps à corps, et seulement s'il survit au coup.
    let riposte: { damage: number; characterHealth: number } | undefined;
    if (saved.state === 'alive' && distance <= MELEE_RANGE) {
      const riposteDamage = Math.max(saved.attack - character.defense, 1);
      const characterHealth = Math.max(character.health - riposteDamage, 0);

      await this.characterRepository.update(characterId, {
        health: characterHealth,
      });

      riposte = { damage: riposteDamage, characterHealth };
    }

    return {
      success: true,
      animal: saved,
      damage,
      attackerId: character.id,
      riposte,
    };
  }

  /**
   * Détermine la portée d'attaque du personnage selon son arme équipée :
   * arme à distance (slot RANGED_WEAPON) en priorité, sinon arme au corps à
   * corps (RIGHT_HAND/LEFT_HAND), sinon mains nues (portée corps à corps).
   */
  private resolveAttackRange(character: Character): number {
    const equipment = character.equipment ?? [];

    const rangedWeapon = equipment.find(
      (eq) =>
        (eq.slot as EquipmentSlot) === EquipmentSlot.RANGED_WEAPON && eq.item,
    );
    if (rangedWeapon) return rangedWeapon.item.range ?? RANGED_RANGE_DEFAULT;

    const meleeWeapon = equipment.find(
      (eq) =>
        ((eq.slot as EquipmentSlot) === EquipmentSlot.RIGHT_HAND ||
          (eq.slot as EquipmentSlot) === EquipmentSlot.LEFT_HAND) &&
        eq.item?.type === 'weapon',
    );
    if (meleeWeapon) return meleeWeapon.item.range ?? MELEE_RANGE;

    return MELEE_RANGE;
  }

  private async seedTurkey() {
    const existing = await this.animalRepository.findOne({
      where: { key: 'turkey_spawn_1' },
    });

    if (existing) {
      await this.animalRepository.update(existing.id, {
        x: 600,
        y: 580,
        health: 30,
        maxHealth: 30,
        armor: 2,
        state: 'alive',
      });
      return;
    }

    await this.animalRepository.save(
      this.animalRepository.create({
        key: 'turkey_spawn_1',
        type: 'turkey',
        name: 'Turkey',
        x: 600,
        y: 580,
        health: 30,
        maxHealth: 30,
        armor: 2,
        state: 'alive',
      }),
    );
  }
}
