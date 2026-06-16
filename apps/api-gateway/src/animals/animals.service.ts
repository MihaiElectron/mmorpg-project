import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from 'socket.io';
import { Animal } from './entities/animal.entity';
import { CreatureTemplate } from './entities/creature-template.entity';
import { CreatureSpawn } from './entities/creature-spawn.entity';
import { Character } from '../characters/entities/character.entity';
import { EquipmentSlot } from '../characters/dto/equip-item.dto';
import { AnimalDto } from './dto/animal.dto';

const MELEE_RANGE = 60;
const RANGED_RANGE_DEFAULT = 300;
const ATTACK_COOLDOWN_MS = 700;
const PATROL_TICK_MS = 200;
const PATROL_MOVE_MIN_MS = 1000;
const PATROL_MOVE_MAX_MS = 4000;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function toDto(animal: Animal): AnimalDto {
  const t = animal.spawn.template;
  return {
    id: animal.id,
    type: t.textureKey,
    name: t.name,
    x: animal.x,
    y: animal.y,
    health: animal.health,
    maxHealth: t.baseHealth,
    armor: t.baseArmor,
    attack: t.baseAttack,
    state: animal.state,
  };
}

type PatrolState = {
  dirX: number;
  dirY: number;
  speed: number;
  moveUntil: number;
  pauseUntil: number;
};

export type AttackSuccess = {
  success: true;
  dto: AnimalDto;
  damage: number;
  attackerId: string;
  riposte?: { damage: number; characterHealth: number };
};
export type AttackFailure = { success: false; error: string };
export type AttackResult = AttackSuccess | AttackFailure;

export function isAttackFailure(result: AttackResult): result is AttackFailure {
  return result.success === false;
}

@Injectable()
export class AnimalsService implements OnModuleInit {
  private readonly lastAttackAt = new Map<string, number>();
  private readonly liveAnimals = new Map<string, Animal>();
  private readonly patrolStates = new Map<string, PatrolState>();

  constructor(
    @InjectRepository(Animal)
    private readonly animalRepository: Repository<Animal>,
    @InjectRepository(CreatureTemplate)
    private readonly templateRepository: Repository<CreatureTemplate>,
    @InjectRepository(CreatureSpawn)
    private readonly spawnRepository: Repository<CreatureSpawn>,
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
  ) {}

  async onModuleInit() {
    await this.seedTemplates();
    await this.seedSpawns();
    await this.seedInstances();
    await this.animalRepository
      .createQueryBuilder()
      .delete()
      .where('spawn_id IS NULL')
      .execute();

    const animals = await this.animalRepository.find();
    for (const a of animals) {
      if (a.spawn) this.liveAnimals.set(a.id, a);
    }
  }

  findAll(): AnimalDto[] {
    return Array.from(this.liveAnimals.values()).map(toDto);
  }

  startPatrol(server: Server) {
    setInterval(() => this.tickPatrol(server), PATROL_TICK_MS);
  }

  private tickPatrol(server: Server) {
    const now = Date.now();

    // Enregistrement paresseux : pick up les animaux charges apres afterInit
    for (const [id, animal] of this.liveAnimals) {
      if (!this.patrolStates.has(id) && animal.spawn && animal.state === 'alive') {
        const { template } = animal.spawn;
        this.patrolStates.set(id, {
          dirX: 0,
          dirY: 0,
          speed: 0,
          moveUntil: 0,
          pauseUntil: now + rand(template.pauseMinMs, template.pauseMaxMs),
        });
      }
    }

    for (const [id, state] of this.patrolStates) {
      const animal = this.liveAnimals.get(id);
      if (!animal || !animal.spawn || animal.state === 'dead') continue;
      if (now < state.pauseUntil) continue;

      const { template } = animal.spawn;

      if (now >= state.moveUntil) {
        const angle = Math.random() * Math.PI * 2;
        state.dirX = Math.cos(angle);
        state.dirY = Math.sin(angle);
        state.speed = rand(template.speedMin, template.speedMax);
        state.moveUntil = now + rand(PATROL_MOVE_MIN_MS, PATROL_MOVE_MAX_MS);
      }

      const dt = PATROL_TICK_MS / 1000;
      const newX = animal.x + state.dirX * state.speed * dt;
      const newY = animal.y + state.dirY * state.speed * dt;

      const dx = newX - animal.spawn.spawnX;
      const dy = newY - animal.spawn.spawnY;
      const dist = Math.hypot(dx, dy);

      if (dist > template.patrolRadius) {
        animal.x = Math.round(animal.spawn.spawnX + (dx / dist) * template.patrolRadius);
        animal.y = Math.round(animal.spawn.spawnY + (dy / dist) * template.patrolRadius);
        state.moveUntil = 0;
        state.pauseUntil = now + rand(template.pauseMinMs, template.pauseMaxMs);
      } else {
        animal.x = Math.round(newX);
        animal.y = Math.round(newY);
      }

      server.emit('animal_update', toDto(animal));
    }
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

    const animal = this.liveAnimals.get(id);
    if (!animal) return { success: false, error: 'Animal not found' };
    if (animal.state === 'dead') return { success: false, error: 'Animal already dead' };

    const character = await this.characterRepository.findOne({
      where: { id: characterId },
      relations: ['equipment', 'equipment.item'],
    });
    if (!character) return { success: false, error: 'Character not found' };
    if (character.health <= 0) return { success: false, error: 'Character is dead' };

    const range = this.resolveAttackRange(character);
    const distance = Math.hypot(
      animal.x - attackerPosition.x,
      animal.y - attackerPosition.y,
    );
    if (distance > range) return { success: false, error: 'Target out of range' };

    this.lastAttackAt.set(characterId, now);

    const { template } = animal.spawn;
    const attack = Math.max(character.attack, 5);
    const damage = Math.max(attack - template.baseArmor, 1);

    animal.health = Math.max(animal.health - damage, 0);
    animal.state = animal.health === 0 ? 'dead' : 'alive';
    await this.animalRepository.save(animal);

    let riposte: { damage: number; characterHealth: number } | undefined;
    if (animal.state === 'alive' && distance <= MELEE_RANGE) {
      const riposteDamage = Math.max(template.baseAttack - character.defense, 1);
      const characterHealth = Math.max(character.health - riposteDamage, 0);
      await this.characterRepository.update(characterId, { health: characterHealth });
      riposte = { damage: riposteDamage, characterHealth };
    }

    return { success: true, dto: toDto(animal), damage, attackerId: character.id, riposte };
  }

  private resolveAttackRange(character: Character): number {
    const equipment = character.equipment ?? [];

    const ranged = equipment.find(
      (eq) => (eq.slot as EquipmentSlot) === EquipmentSlot.RANGED_WEAPON && eq.item,
    );
    if (ranged) return ranged.item.range ?? RANGED_RANGE_DEFAULT;

    const melee = equipment.find(
      (eq) =>
        ((eq.slot as EquipmentSlot) === EquipmentSlot.RIGHT_HAND ||
          (eq.slot as EquipmentSlot) === EquipmentSlot.LEFT_HAND) &&
        eq.item?.type === 'weapon',
    );
    if (melee) return melee.item.range ?? MELEE_RANGE;

    return MELEE_RANGE;
  }

  // -------------------------------------------------------------------------
  // Seed — données initiales (exécuté une seule fois par entrée absente)
  // -------------------------------------------------------------------------

  private async seedTemplates() {
    await this.templateRepository.upsert(
      {
        key: 'turkey',
        name: 'Turkey',
        textureKey: 'turkey',
        baseHealth: 30,
        baseArmor: 2,
        baseAttack: 5,
        patrolRadius: 200,
        speedMin: 25,
        speedMax: 60,
        pauseMinMs: 2000,
        pauseMaxMs: 12000,
      },
      ['key'],
    );
  }

  private async seedSpawns() {
    const exists = await this.spawnRepository.findOne({ where: { key: 'turkey_spawn_1' } });
    if (exists) return;

    const template = await this.templateRepository.findOne({ where: { key: 'turkey' } });
    await this.spawnRepository.save(
      this.spawnRepository.create({
        key: 'turkey_spawn_1',
        template,
        spawnX: 600,
        spawnY: 580,
        respawnDelayMs: 30000,
      }),
    );
  }

  private async seedInstances() {
    const spawns = await this.spawnRepository.find();

    for (const spawn of spawns) {
      const existing = await this.animalRepository.findOne({
        where: { spawn: { id: spawn.id } },
      });
      if (existing) continue;

      await this.animalRepository.save(
        this.animalRepository.create({
          spawn,
          x: spawn.spawnX,
          y: spawn.spawnY,
          health: spawn.template.baseHealth,
          state: 'alive',
        }),
      );
    }
  }
}
