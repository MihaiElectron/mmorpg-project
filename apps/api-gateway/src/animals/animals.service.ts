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
import { WorldService, ConnectedPlayer } from '../world/world.service';

const MELEE_RANGE = 60;
const RANGED_RANGE_DEFAULT = 300;
const ATTACK_COOLDOWN_MS = 700;
const AUTO_ATTACK_COOLDOWN_MS = 1500;
const PATROL_TICK_MS = 200;
const PATROL_MOVE_MIN_MS = 1000;
const PATROL_MOVE_MAX_MS = 4000;
const LEASH_MULTIPLIER = 2;
const ESCAPE_RADIUS_MULTIPLIER = 2;

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function findNearestPlayer(
  players: ConnectedPlayer[],
  animal: Animal,
): { player: ConnectedPlayer; dist: number } | null {
  let nearest: ConnectedPlayer | null = null;
  let minDist = Infinity;
  for (const p of players) {
    const d = Math.hypot(p.x - animal.x, p.y - animal.y);
    if (d < minDist) { minDist = d; nearest = p; }
  }
  return nearest ? { player: nearest, dist: minDist } : null;
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
  targetCharacterId?: string;
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
  private readonly lastAnimalAutoAttackAt = new Map<string, number>();
  private readonly liveAnimals = new Map<string, Animal>();
  private readonly patrolStates = new Map<string, PatrolState>();
  private server: Server | null = null;

  constructor(
    @InjectRepository(Animal)
    private readonly animalRepository: Repository<Animal>,
    @InjectRepository(CreatureTemplate)
    private readonly templateRepository: Repository<CreatureTemplate>,
    @InjectRepository(CreatureSpawn)
    private readonly spawnRepository: Repository<CreatureSpawn>,
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
    private readonly worldService: WorldService,
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

    // Réinitialiser les états comportementaux non-persistants au redémarrage
    await this.animalRepository
      .createQueryBuilder()
      .update()
      .set({ state: 'alive' })
      .where("state IN ('fighting', 'escaping')")
      .execute();

    const animals = await this.animalRepository.find();
    for (const a of animals) {
      if (!a.spawn) continue;
      if (a.state === 'dead') {
        a.state = 'alive';
        a.health = a.spawn.template.baseHealth;
        a.x = a.spawn.spawnX;
        a.y = a.spawn.spawnY;
        await this.animalRepository.save(a);
      }
      this.liveAnimals.set(a.id, a);
    }
  }

  findAll(): AnimalDto[] {
    return Array.from(this.liveAnimals.values()).map(toDto);
  }

  startPatrol(server: Server) {
    this.server = server;
    setInterval(() => this.tickPatrol(server).catch(console.error), PATROL_TICK_MS);
  }

  private async tickPatrol(server: Server) {
    const now = Date.now();
    const players = this.worldService.getAllConnectedPlayers();

    // Enregistrement paresseux : pick up les animaux charges apres afterInit
    for (const [id, animal] of this.liveAnimals) {
      if (!this.patrolStates.has(id) && animal.spawn && animal.state !== 'dead') {
        const { template } = animal.spawn;
        this.patrolStates.set(id, {
          dirX: 0, dirY: 0, speed: 0, moveUntil: 0,
          pauseUntil: now + rand(template.pauseMinMs, template.pauseMaxMs),
        });
      }
    }

    for (const [id, state] of this.patrolStates) {
      const animal = this.liveAnimals.get(id);
      if (!animal || !animal.spawn || animal.state === 'dead') continue;

      const { template } = animal.spawn;
      const hpPct = (animal.health / template.baseHealth) * 100;

      // Transition : fuite (prioritaire)
      if (template.fleeThresholdPct > 0 && hpPct < template.fleeThresholdPct && animal.state !== 'escaping') {
        await this.changeAnimalState(animal, 'escaping');
        state.targetCharacterId = undefined;
      }

      // Transition : aggro (seulement en patrouille)
      if (animal.state === 'alive' && template.aggroRadius > 0 && players.length > 0) {
        const nearest = findNearestPlayer(players, animal);
        if (nearest && nearest.dist <= template.aggroRadius) {
          await this.changeAnimalState(animal, 'fighting');
          state.targetCharacterId = nearest.player.characterId;
        }
      }

      switch (animal.state) {
        case 'alive':
          this.doPatrolMovement(animal, state, template, now);
          break;
        case 'fighting':
          await this.doFighting(animal, state, template, players, now, server);
          break;
        case 'escaping':
          await this.doEscaping(animal, state, template, players, now);
          break;
      }

      server.emit('animal_update', toDto(animal));
    }
  }

  private doPatrolMovement(
    animal: Animal,
    state: PatrolState,
    template: CreatureTemplate,
    now: number,
  ) {
    if (now < state.pauseUntil) return;

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
  }

  private async doFighting(
    animal: Animal,
    state: PatrolState,
    template: CreatureTemplate,
    players: ConnectedPlayer[],
    now: number,
    server: Server,
  ) {
    const target = state.targetCharacterId
      ? players.find((p) => p.characterId === state.targetCharacterId)
      : null;

    // Cible disparue ou laisse rompue → retour en patrouille
    if (!target) {
      await this.changeAnimalState(animal, 'alive');
      state.targetCharacterId = undefined;
      return;
    }

    const dx = target.x - animal.x;
    const dy = target.y - animal.y;
    const dist = Math.hypot(dx, dy);

    const spawnDist = Math.hypot(animal.x - animal.spawn.spawnX, animal.y - animal.spawn.spawnY);
    if (spawnDist > template.patrolRadius * LEASH_MULTIPLIER) {
      await this.changeAnimalState(animal, 'alive');
      state.targetCharacterId = undefined;
      return;
    }

    // Avancer vers la cible
    if (dist > MELEE_RANGE) {
      const dt = PATROL_TICK_MS / 1000;
      animal.x = Math.round(animal.x + (dx / dist) * template.speedMax * dt);
      animal.y = Math.round(animal.y + (dy / dist) * template.speedMax * dt);
    }

    // Auto-attaque
    const lastAtk = this.lastAnimalAutoAttackAt.get(animal.id) ?? 0;
    if (dist <= MELEE_RANGE && now - lastAtk >= AUTO_ATTACK_COOLDOWN_MS) {
      this.lastAnimalAutoAttackAt.set(animal.id, now);
      const char = await this.characterRepository.findOne({ where: { id: target.characterId } });
      if (char && char.health > 0) {
        const dmg = Math.max(template.baseAttack - char.defense, 1);
        const newHealth = Math.max(char.health - dmg, 0);
        await this.characterRepository.update(char.id, { health: newHealth });
        server.to(target.socketId).emit('character_damaged', {
          characterId: char.id,
          damage: dmg,
          health: newHealth,
        });
        if (newHealth === 0) {
          await this.worldService.respawnCharacter(char.id, server);
        }
      }
    }
  }

  private async doEscaping(
    animal: Animal,
    state: PatrolState,
    template: CreatureTemplate,
    players: ConnectedPlayer[],
    now: number,
  ) {
    const nearest = findNearestPlayer(players, animal);

    // Plus de joueurs ou suffisamment loin → retour en patrouille
    if (!nearest || nearest.dist > template.patrolRadius) {
      await this.changeAnimalState(animal, 'alive');
      state.pauseUntil = now + rand(template.pauseMinMs, template.pauseMaxMs);
      return;
    }

    const dx = animal.x - nearest.player.x;
    const dy = animal.y - nearest.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;

    const dt = PATROL_TICK_MS / 1000;
    const newX = animal.x + (dx / dist) * template.speedMax * dt;
    const newY = animal.y + (dy / dist) * template.speedMax * dt;

    const escDx = newX - animal.spawn.spawnX;
    const escDy = newY - animal.spawn.spawnY;
    const escDist = Math.hypot(escDx, escDy);
    const maxRadius = template.patrolRadius * ESCAPE_RADIUS_MULTIPLIER;

    if (escDist > maxRadius) {
      animal.x = Math.round(animal.spawn.spawnX + (escDx / escDist) * maxRadius);
      animal.y = Math.round(animal.spawn.spawnY + (escDy / escDist) * maxRadius);
    } else {
      animal.x = Math.round(newX);
      animal.y = Math.round(newY);
    }
  }

  private async changeAnimalState(animal: Animal, newState: Animal['state']) {
    animal.state = newState;
    await this.animalRepository.update(animal.id, { state: newState });
  }

  private async respawnAnimal(id: string) {
    const animal = this.liveAnimals.get(id);
    if (!animal || !animal.spawn || animal.state !== 'dead') return;

    const { template } = animal.spawn;
    animal.state = 'alive';
    animal.health = template.baseHealth;
    animal.x = animal.spawn.spawnX;
    animal.y = animal.spawn.spawnY;

    await this.animalRepository.update(id, {
      state: 'alive',
      health: template.baseHealth,
      x: animal.spawn.spawnX,
      y: animal.spawn.spawnY,
    });

    if (this.server) {
      this.server.emit('animal_update', toDto(animal));
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
    if (animal.health === 0) {
      animal.state = 'dead';
      this.patrolStates.delete(animal.id);
      const delay = animal.spawn.respawnDelayMs;
      setTimeout(() => this.respawnAnimal(animal.id), delay);
    }
    await this.animalRepository.save(animal);

    let riposte: { damage: number; characterHealth: number } | undefined;
    if ((animal.state === 'alive' || animal.state === 'fighting') && distance <= MELEE_RANGE) {
      const riposteDamage = Math.max(template.baseAttack - character.defense, 1);
      const characterHealth = Math.max(character.health - riposteDamage, 0);
      await this.characterRepository.update(characterId, { health: characterHealth });
      riposte = { damage: riposteDamage, characterHealth };
      if (characterHealth === 0 && this.server) {
        await this.worldService.respawnCharacter(characterId, this.server);
      }
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
      [
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
          aggroRadius: 50,
          fleeThresholdPct: 75,
        },
        {
          key: 'goblin',
          name: 'Goblin',
          textureKey: 'turkey', // placeholder jusqu'à l'import du sprite goblin
          baseHealth: 60,
          baseArmor: 5,
          baseAttack: 12,
          patrolRadius: 150,
          speedMin: 40,
          speedMax: 80,
          pauseMinMs: 1000,
          pauseMaxMs: 6000,
          aggroRadius: 120,
          fleeThresholdPct: 20,
        },
      ],
      ['key'],
    );
  }

  async createAdminSpawn(
    templateKey: string,
    x: number,
    y: number,
  ): Promise<AnimalDto | null> {
    const template = await this.templateRepository.findOne({
      where: { key: templateKey },
    });
    if (!template) return null;

    const spawnKey = `admin-${templateKey}-${Date.now()}`;
    const spawn = await this.spawnRepository.save(
      this.spawnRepository.create({
        key: spawnKey,
        template,
        spawnX: Math.round(x),
        spawnY: Math.round(y),
        respawnDelayMs: 30000,
      }),
    );

    const rawAnimal = await this.animalRepository.save(
      this.animalRepository.create({
        spawn,
        x: Math.round(x),
        y: Math.round(y),
        health: template.baseHealth,
        state: 'alive',
      }),
    );

    // Recharger avec les relations eager (spawn.template)
    const animal = await this.animalRepository.findOne({
      where: { id: rawAnimal.id },
    });
    if (!animal) return null;

    this.liveAnimals.set(animal.id, animal);
    return toDto(animal);
  }

  refreshTemplateInMemory(key: string, fields: Partial<Record<string, number>>): void {
    for (const animal of this.liveAnimals.values()) {
      if (animal.spawn?.template?.key === key) {
        Object.assign(animal.spawn.template, fields);
        // Recalibrer les HP si baseHealth diminue sous le HP actuel
        const newMax = (animal.spawn.template as any).baseHealth;
        if (newMax !== undefined && animal.health > newMax) {
          animal.health = newMax;
        }
      }
    }
  }

  async adminDeleteAnimal(id: string): Promise<AnimalDto | null> {
    const animal = this.liveAnimals.get(id);
    if (!animal) return null;

    const dto = toDto(animal);
    const spawnId = animal.spawn?.id;
    const spawnKey = animal.spawn?.key ?? '';

    this.liveAnimals.delete(id);
    this.patrolStates.delete(id);

    // Supprimer la ligne Animal — le startup ne pourra plus la ressusciter
    await this.animalRepository.delete(id);

    // Supprimer aussi le spawn si créé par admin (pas de seed à conserver)
    if (spawnKey.startsWith('admin-') && spawnId) {
      await this.spawnRepository.delete(spawnId);
    }

    return dto;
  }

  async moveAnimal(animalId: string, x: number, y: number): Promise<AnimalDto | null> {
    const animal = this.liveAnimals.get(animalId);
    if (!animal || animal.state === 'dead') return null;

    animal.x = Math.round(x);
    animal.y = Math.round(y);
    this.patrolStates.delete(animalId);

    await this.animalRepository.update(animalId, { x: animal.x, y: animal.y });

    if (this.server) {
      this.server.emit('animal_update', toDto(animal));
    }
    return toDto(animal);
  }

  async forceRespawnAll(templateKey: string): Promise<number> {
    let count = 0;
    for (const animal of this.liveAnimals.values()) {
      if (animal.spawn?.template?.key !== templateKey) continue;

      const { template } = animal.spawn;
      animal.state = 'alive';
      animal.health = template.baseHealth;
      animal.x = animal.spawn.spawnX;
      animal.y = animal.spawn.spawnY;

      this.patrolStates.delete(animal.id);
      this.lastAnimalAutoAttackAt.delete(animal.id);

      await this.animalRepository.update(animal.id, {
        state: 'alive',
        health: template.baseHealth,
        x: animal.spawn.spawnX,
        y: animal.spawn.spawnY,
      });

      if (this.server) {
        this.server.emit('animal_update', toDto(animal));
      }
      count++;
    }
    return count;
  }

  private async seedSpawns() {
    const template = await this.templateRepository.findOne({ where: { key: 'turkey' } });
    if (!template) return;

    const existing = await this.spawnRepository.findOne({ where: { key: 'turkey_spawn_1' } });
    if (existing) {
      if (existing.respawnDelayMs !== 20000) {
        await this.spawnRepository.update(existing.id, { respawnDelayMs: 20000 });
      }
      return;
    }

    await this.spawnRepository.save(
      this.spawnRepository.create({
        key: 'turkey_spawn_1',
        template,
        spawnX: 600,
        spawnY: 580,
        respawnDelayMs: 20000,
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
