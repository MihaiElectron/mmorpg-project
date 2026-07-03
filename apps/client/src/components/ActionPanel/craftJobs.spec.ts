import { describe, expect, it } from "vitest";
import {
  buildCraftJobLaunchPayload,
  craftJobProgress,
  craftJobRemainingMs,
  formatRemaining,
  groupCraftJobs,
  isClaimable,
  CRAFT_JOB_MAX_QUANTITY,
  type CraftJobDto,
  type CraftJobState,
} from "./craftJobs";

function job(state: CraftJobState, overrides: Partial<CraftJobDto> = {}): CraftJobDto {
  return {
    jobId: `job-${state}`,
    recipeId: "rec-1",
    recipeName: "Fondre minerai",
    stationType: "forge",
    quantity: 1,
    state,
    startedAt: "2026-07-01T00:00:00.000Z",
    finishAt: "2026-07-01T00:10:00.000Z",
    completedAt: null,
    claimedAt: null,
    successes: 0,
    failures: 0,
    outputs: [{ itemId: "item-bar", itemName: "Lingot", itemImage: null, quantity: 1, resolvedQuantity: 1 }],
    ...overrides,
  };
}

describe("craftJobs helpers", () => {
  it("buildCraftJobLaunchPayload borne quantity dans [1, 99]", () => {
    expect(buildCraftJobLaunchPayload("r", 5)).toEqual({ recipeId: "r", quantity: 5 });
    expect(buildCraftJobLaunchPayload("r", 0)).toEqual({ recipeId: "r", quantity: 1 });
    expect(buildCraftJobLaunchPayload("r", 999)).toEqual({ recipeId: "r", quantity: CRAFT_JOB_MAX_QUANTITY });
  });

  it("craftJobRemainingMs ne descend jamais sous 0", () => {
    const finish = "2026-07-01T00:10:00.000Z";
    expect(craftJobRemainingMs(finish, Date.parse("2026-07-01T00:04:00.000Z"))).toBe(6 * 60_000);
    expect(craftJobRemainingMs(finish, Date.parse("2026-07-01T00:20:00.000Z"))).toBe(0);
  });

  it("craftJobProgress renvoie une valeur clampée 0..1", () => {
    const s = "2026-07-01T00:00:00.000Z";
    const f = "2026-07-01T00:10:00.000Z";
    expect(craftJobProgress(s, f, Date.parse("2026-07-01T00:00:00.000Z"))).toBe(0);
    expect(craftJobProgress(s, f, Date.parse("2026-07-01T00:05:00.000Z"))).toBe(0.5);
    expect(craftJobProgress(s, f, Date.parse("2026-07-01T00:15:00.000Z"))).toBe(1);
  });

  it("formatRemaining formate secondes / minutes / heures", () => {
    expect(formatRemaining(0)).toBe("prêt");
    expect(formatRemaining(30_000)).toBe("30 s");
    expect(formatRemaining(90_000)).toBe("1 min 30 s");
    expect(formatRemaining(120_000)).toBe("2 min");
    expect(formatRemaining(3_600_000)).toBe("1 h");
  });

  it("isClaimable vrai seulement pour COMPLETED", () => {
    expect(isClaimable(job("COMPLETED"))).toBe(true);
    expect(isClaimable(job("RUNNING"))).toBe(false);
    expect(isClaimable(job("FAILED"))).toBe(false);
    expect(isClaimable(job("CLAIMED"))).toBe(false);
  });

  it("groupCraftJobs répartit RUNNING/COMPLETED/FAILED et exclut CLAIMED/CANCELLED", () => {
    const grouped = groupCraftJobs([
      job("RUNNING"),
      job("COMPLETED"),
      job("FAILED"),
      job("CLAIMED"),
      job("CANCELLED"),
    ]);
    expect(grouped.running).toHaveLength(1);
    expect(grouped.completed).toHaveLength(1);
    expect(grouped.failed).toHaveLength(1);
    // CLAIMED et CANCELLED ne sont dans aucun groupe affiché
    const total = grouped.running.length + grouped.completed.length + grouped.failed.length;
    expect(total).toBe(3);
  });
});
