/**
 * craftJobs.ts — logique pure (testable) de la production différée CraftJob.
 * Aucune I/O ici : le panneau appelle ces helpers + les endpoints REST.
 */

export type CraftJobState = "RUNNING" | "COMPLETED" | "FAILED" | "CLAIMED" | "CANCELLED";

export type CraftJobOutputDto = {
  itemId: string;
  itemName: string;
  itemImage: string | null;
  quantity: number;
  chance: number;
  resolvedQuantity: number;
};

export type CraftJobIngredientDto = {
  itemId: string;
  itemName: string;
  itemImage: string | null;
  objectMode: string;
  requiredQuantity: number;
  reservedQuantity: number;
  consumedQuantity: number;
};

export type CraftJobDto = {
  jobId: string;
  recipeId: string;
  recipeName: string;
  stationType: string;
  quantity: number;
  craftTimeMs: number;
  state: CraftJobState;
  startedAt: string;
  finishAt: string;
  completedAt: string | null;
  claimedAt: string | null;
  successes: number;
  failures: number;
  // XP réellement accordée à la complétion (0 tant que RUNNING). Fournie par le serveur.
  grantedCharacterXp: number;
  grantedMasteryXp: number;
  failureMasteryXpMultiplier: number;
  ingredients: CraftJobIngredientDto[];
  outputs: CraftJobOutputDto[];
};

/** Objet d'un résumé de claim (produced / ingredientsConsumed). */
export type CraftClaimItem = {
  itemId: string;
  itemName: string;
  itemImage: string | null;
  quantity: number;
};

/** Résumé complet renvoyé par POST /crafting/jobs/:id/claim — affiché tel quel. */
export type CraftClaimSummary = {
  jobId: string;
  state: CraftJobState;
  recipeName: string;
  quantity: number;
  successes: number;
  failures: number;
  produced: CraftClaimItem[];
  ingredientsConsumed: CraftClaimItem[];
  grantedCharacterXp: number;
  grantedMasteryXp: number;
  completedAt: string | null;
  claimedAt: string | null;
};

/** Borne serveur (@Max(99)). */
export const CRAFT_JOB_MAX_QUANTITY = 99;

/**
 * Réponse de l'action joueur unique « Fabriquer » (POST /crafting/craft). Toute
 * fabrication crée un CraftJob (`mode: "job"`) — l'output n'est matérialisé qu'au
 * claim. Le discriminant `mode` est conservé pour absorber une éventuelle
 * extension serveur future sans casser le client.
 */
export type CraftExecuteResponse = { mode: "job"; job: CraftJobDto };

/** Intervalle de polling (ms) — remplaçable par du websocket plus tard. */
export const CRAFT_JOB_POLL_MS = 10_000;

export function buildCraftJobLaunchPayload(
  recipeId: string,
  quantity = 1,
): { recipeId: string; quantity: number } {
  const bounded = Math.max(1, Math.min(CRAFT_JOB_MAX_QUANTITY, Math.floor(quantity) || 1));
  return { recipeId, quantity: bounded };
}

function toMs(value: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Millisecondes restantes avant `finishAt` (>= 0). */
export function craftJobRemainingMs(finishAt: string, now: number = Date.now()): number {
  const end = toMs(finishAt);
  if (end == null) return 0;
  return Math.max(0, end - now);
}

/** Progression 0..1 entre startedAt et finishAt. */
export function craftJobProgress(
  startedAt: string,
  finishAt: string,
  now: number = Date.now(),
): number {
  const start = toMs(startedAt);
  const end = toMs(finishAt);
  if (start == null || end == null || end <= start) return 1;
  const ratio = (now - start) / (end - start);
  return Math.max(0, Math.min(1, ratio));
}

/**
 * Libellé de temps restant lisible. Retourne "" quand il ne reste plus de temps
 * (≤ 0) : il n'existe pas d'état « prêt » séparé — l'appelant affiche alors
 * « Finalisation… » (RUNNING) puis « Réclamer » (COMPLETED).
 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "";
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes} min ${seconds} s` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
}

/** Un job COMPLETED est réclamable (le serveur reste l'autorité). */
export function isClaimable(job: Pick<CraftJobDto, "state">): boolean {
  return job.state === "COMPLETED";
}

export type GroupedCraftJobs = {
  running: CraftJobDto[];
  completed: CraftJobDto[];
  failed: CraftJobDto[];
};

/**
 * Regroupe les jobs par catégorie d'affichage. CLAIMED et CANCELLED ne sont pas
 * affichés (production close). L'ordre d'entrée (déjà trié serveur) est conservé.
 */
export function groupCraftJobs(jobs: CraftJobDto[]): GroupedCraftJobs {
  const running: CraftJobDto[] = [];
  const completed: CraftJobDto[] = [];
  const failed: CraftJobDto[] = [];
  for (const job of jobs) {
    if (job.state === "RUNNING") running.push(job);
    else if (job.state === "COMPLETED") completed.push(job);
    else if (job.state === "FAILED") failed.push(job);
  }
  return { running, completed, failed };
}
