import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CraftJobService } from './craft-job.service';
import { CraftJobState } from './entities/craft-job.entity';

/** Nombre maximum de jobs traités par tick (batch borné). */
export const CRAFT_JOB_COMPLETION_BATCH = 100;

/**
 * CraftJobScheduler — complétion des jobs dus (ADR-0009, Phase 2).
 *
 * Sélectionne les CraftJob RUNNING dont `finishAt <= now` (batch borné) et les
 * complète un par un, chacun dans sa propre transaction idempotente
 * (`CraftJobService.complete` : verrou + recheck RUNNING). Une erreur sur un job
 * n'interrompt pas le batch.
 *
 * Cadence : toutes les 10 s (et non chaque minute) pour rester cohérent avec des
 * durées de craft courtes — un job n'est jamais complété avant son `finishAt`
 * (garanti par le filtre `finishAt <= now`), mais l'est au tick 10 s suivant.
 *
 * INVARIANT ADR-0009 : le scheduler ne crée, ne détruit ni ne déplace aucun Item
 * OUTPUT. Il ne fait qu'évoluer l'état des jobs. La matérialisation est au claim
 * (Phase 3). Crash / redémarrage / double-tick ne peuvent donc jamais dupliquer
 * d'objets (idempotence par construction).
 */
@Injectable()
export class CraftJobScheduler {
  private readonly logger = new Logger(CraftJobScheduler.name);

  constructor(private readonly craftJobs: CraftJobService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleDueJobs(): Promise<void> {
    let jobIds: string[];
    try {
      jobIds = await this.craftJobs.findDueJobIds(new Date(), CRAFT_JOB_COMPLETION_BATCH);
    } catch (err) {
      this.logger.error(`Erreur lecture des jobs dus: ${(err as Error).message}`);
      return;
    }
    if (jobIds.length === 0) return;

    let completed = 0;
    let failed = 0;
    for (const jobId of jobIds) {
      try {
        const result = await this.craftJobs.complete(jobId);
        if (!result) {
          // Job déjà traité ou plus RUNNING entre la lecture et le lock.
          this.logger.debug(`CraftJob ${jobId} ignoré (état non RUNNING)`);
          continue;
        }
        if (result.state === CraftJobState.COMPLETED) completed++;
        else failed++;
      } catch (err) {
        this.logger.error(`Erreur complétion CraftJob ${jobId}: ${(err as Error).message}`);
      }
    }

    if (completed > 0 || failed > 0) {
      this.logger.log(`CraftJob complétion: ${completed} completed, ${failed} failed.`);
    }
  }
}
