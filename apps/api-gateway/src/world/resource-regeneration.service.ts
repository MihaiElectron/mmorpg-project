import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Server } from 'socket.io';
import { Character } from '../characters/entities/character.entity';
import { CharacterStatsCalculator } from '../characters/character-stats-calculator';
import { aggregateEquipmentBonuses, aggregateEquipmentDerivedModifiers, mergeDerivedStatModifiers } from '../characters/equipment-stats.helper';
import { DerivedStatsService } from '../derived-stats/derived-stats.service';
import { MasteryEffectsService } from '../masteries/mastery-effects.service';
import { WorldService } from './world.service';

/**
 * Cadence du tick global de régénération des ressources (Character Resources
 * V1-K-A). Un SEUL interval serveur traite tous les joueurs connectés — jamais
 * un timer par joueur.
 */
export const RESOURCE_REGEN_TICK_MS = 1000;

/**
 * Régénération bornée par pas de temps, à intervalle plus long que le tick pour
 * éviter qu'une pause du process (GC, debug) n'injecte un gain géant.
 */
const MAX_REGEN_ELAPSED_SECONDS = 5;

export interface RegenStepInput {
  /** Ressource courante (source de vérité DB, relue à chaque tick). */
  current: number;
  /** Maximum dérivé serveur (jamais une colonne DB). */
  max: number;
  /**
   * Régénération en POINTS PAR SECONDE (stat dérivée `manaRegen`/`energyRegen`).
   * Valeur potentiellement fractionnaire ; l'entier seul est appliqué, la
   * fraction est reportée via `accumulator`.
   */
  regenPerSecond: number;
  /** Secondes écoulées depuis le dernier tick appliqué à ce personnage. */
  elapsedSeconds: number;
  /** Fraction non encore matérialisée (< 1), conservée en mémoire. */
  accumulator: number;
}

export interface RegenStepResult {
  /** Nouvelle valeur entière (clamp [0, max]). */
  next: number;
  /** Fraction restante à reporter au prochain tick. */
  accumulator: number;
  /** `true` si `next !== current` (⇒ persister + émettre). */
  changed: boolean;
}

/**
 * Fonction PURE de régénération fractionnaire (aucune I/O). Permet une regen
 * lente (< 1/s) : les fractions s'accumulent jusqu'à produire +1 entier.
 *
 * Règles :
 *  - `max <= 0` ou `regenPerSecond <= 0` ou déjà plein ⇒ aucun gain, accumulateur remis à 0 ;
 *  - sinon `gainFloat = accumulator + regenPerSecond * elapsedSeconds` ;
 *    `gainInt = floor(gainFloat)` appliqué, `accumulator = gainFloat - gainInt` reporté ;
 *  - `next = min(max, current + gainInt)` — jamais < 0, jamais > max.
 */
export function computeResourceRegenStep(input: RegenStepInput): RegenStepResult {
  const { current, max, regenPerSecond } = input;
  const accumulator = Number.isFinite(input.accumulator) ? input.accumulator : 0;
  const elapsedSeconds = Number.isFinite(input.elapsedSeconds) ? Math.max(0, input.elapsedSeconds) : 0;

  // Rien à régénérer : pas de max, pas de regen, ou ressource déjà pleine.
  if (!(max > 0) || !(regenPerSecond > 0) || current >= max) {
    return { next: current, accumulator: 0, changed: false };
  }

  const gainFloat = accumulator + regenPerSecond * elapsedSeconds;
  const gainInt = Math.floor(gainFloat);
  const nextAccumulator = gainFloat - gainInt;
  const next = Math.min(max, Math.max(0, current + gainInt));

  return { next, accumulator: nextAccumulator, changed: next !== current };
}

interface ResourceAccumulators {
  health: number;
  mana: number;
  energy: number;
  /** Dernier tick appliqué (ms) — sert au calcul du dt réel. */
  lastTickAt: number;
}

/**
 * ResourceRegenerationService — régénération serveur mana/énergie (V1-K-A).
 *
 * Modèle : UN tick global (`RESOURCE_REGEN_TICK_MS`) sur les seuls joueurs
 * CONNECTÉS et VIVANTS. La DB reste la source de vérité des ressources
 * courantes : chaque tick RELIT `mana`/`energy` depuis la DB (donc toute
 * consommation récente par `SkillCastService` est prise en compte) et n'écrit
 * que si l'entier change. Les accumulateurs mémoire ne portent QUE les fractions
 * non matérialisées, jamais l'autorité sur la ressource.
 *
 * Hors périmètre V1 : pas de regen hors-ligne, pas de conditionnement au combat,
 * pas de nouveau champ DB, pas de regen client.
 */
@Injectable()
export class ResourceRegenerationService implements OnApplicationShutdown {
  private readonly logger = new Logger(ResourceRegenerationService.name);
  private server: Server | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  /** Fractions non persistées par personnage. Pas la source de vérité. */
  private accumulators = new Map<string, ResourceAccumulators>();

  constructor(
    @InjectRepository(Character)
    private readonly characterRepository: Repository<Character>,
    private readonly derivedStats: DerivedStatsService,
    private readonly masteryEffects: MasteryEffectsService,
    private readonly worldService: WorldService,
  ) {}

  /** Démarre le tick global. Idempotent : n'installe jamais un second interval. */
  start(server: Server): void {
    this.server = server;
    if (this.intervalHandle) return; // garde anti-double-interval (afterInit rappelé)
    this.intervalHandle = setInterval(() => {
      this.tick().catch((err) => this.logger.error(`tick regen échoué: ${(err as Error).message}`));
    }, RESOURCE_REGEN_TICK_MS);
  }

  /** Arrête le tick et purge les accumulateurs. */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.accumulators.clear();
  }

  onApplicationShutdown(): void {
    this.stop();
  }

  /**
   * Un pas de régénération global. Public pour tests (évite un vrai timer).
   */
  async tick(): Promise<void> {
    const players = this.worldService.getAllConnectedPlayers();
    if (players.length === 0) {
      // Personne connecté : rien à faire, on purge les fractions résiduelles.
      if (this.accumulators.size > 0) this.accumulators.clear();
      return;
    }

    // characterId -> socketId (dernier gagnant en cas de doublon). Sert à
    // n'émettre qu'au seul joueur concerné, jamais en broadcast.
    const socketByCharacter = new Map<string, string>();
    for (const p of players) socketByCharacter.set(p.characterId, p.socketId);

    const characterIds = Array.from(socketByCharacter.keys());

    // Purge des accumulateurs des personnages qui ne sont plus connectés.
    for (const id of this.accumulators.keys()) {
      if (!socketByCharacter.has(id)) this.accumulators.delete(id);
    }

    const characters = await this.characterRepository.find({
      where: { id: In(characterIds) },
      relations: ['equipment', 'equipment.item'],
    });
    if (characters.length === 0) return;

    const definitions = await this.derivedStats.getDefinitions();
    const now = Date.now();

    for (const character of characters) {
      // Personnage mort ignoré (V1 : regen vivant uniquement).
      if (character.health == null || character.health <= 0) {
        this.accumulators.delete(character.id);
        continue;
      }

      const acc = this.accumulators.get(character.id);
      const elapsedSeconds = acc
        ? Math.min(MAX_REGEN_ELAPSED_SECONDS, Math.max(0, (now - acc.lastTickAt) / 1000))
        : RESOURCE_REGEN_TICK_MS / 1000;
      const healthAcc = acc?.health ?? 0;
      const manaAcc = acc?.mana ?? 0;
      const energyAcc = acc?.energy ?? 0;

      // Max dérivés AVEC équipement : la regen ne doit pas plafonner à un max
      // non équipé (regression Équipement V1) ni écraser l'UI via l'event.
      // Modificateurs de maîtrise permanents inclus : les regens dérivées
      // (healthRegen/manaRegen/energyRegen) et les max en dépendent (V2).
      const derived = CharacterStatsCalculator.compute(
        character,
        definitions,
        aggregateEquipmentBonuses(character.equipment),
        // V5-F : regens/max dérivés incluent les stats secondaires d'équipement
        // (flat) fusionnées avec les modificateurs de maîtrise permanents.
        mergeDerivedStatModifiers(
          await this.masteryEffects.getPermanentStatModifiers(character.id),
          aggregateEquipmentDerivedModifiers(character.equipment, definitions),
        ),
      ).derived;
      const maxHealth = Math.max(1, Math.round(derived.maxHealth));
      const maxMana = Math.max(0, Math.round(derived.maxMana));
      const maxEnergy = Math.max(0, Math.round(derived.maxEnergy));

      // HP régénérée comme mana/énergie (healthRegen dérivé), même modèle
      // fractionnaire, plafonnée au maxHealth ÉQUIPÉ, joueur vivant uniquement.
      const healthStep = computeResourceRegenStep({
        current: character.health ?? 0,
        max: maxHealth,
        regenPerSecond: derived.healthRegen,
        elapsedSeconds,
        accumulator: healthAcc,
      });
      const manaStep = computeResourceRegenStep({
        current: character.mana ?? 0,
        max: maxMana,
        regenPerSecond: derived.manaRegen,
        elapsedSeconds,
        accumulator: manaAcc,
      });
      const energyStep = computeResourceRegenStep({
        current: character.energy ?? 0,
        max: maxEnergy,
        regenPerSecond: derived.energyRegen,
        elapsedSeconds,
        accumulator: energyAcc,
      });

      this.accumulators.set(character.id, {
        health: healthStep.accumulator,
        mana: manaStep.accumulator,
        energy: energyStep.accumulator,
        lastTickAt: now,
      });

      if (!healthStep.changed && !manaStep.changed && !energyStep.changed) continue; // rien à faire

      const update: Partial<Character> = {};
      if (healthStep.changed) update.health = healthStep.next;
      if (manaStep.changed) update.mana = manaStep.next;
      if (energyStep.changed) update.energy = energyStep.next;
      await this.characterRepository.update(character.id, update);

      const socketId = socketByCharacter.get(character.id);
      if (socketId && this.server) {
        this.server.to(socketId).emit('character_resource_update', {
          characterId: character.id,
          health: healthStep.next,
          mana: manaStep.next,
          energy: energyStep.next,
          maxHealth,
          maxMana,
          maxEnergy,
        });
      }
    }
  }
}
