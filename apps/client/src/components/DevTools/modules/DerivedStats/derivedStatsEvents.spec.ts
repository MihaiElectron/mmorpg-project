import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  notifyDerivedStatsChanged,
  onDerivedStatsChanged,
  DERIVED_STATS_CHANGED,
} from "./derivedStatsEvents";

describe("derivedStatsEvents", () => {
  beforeEach(() => {
    // EventTarget natif (Node) → addEventListener/dispatchEvent fonctionnels.
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("expose le canal devtools:derived-stats-changed", () => {
    expect(DERIVED_STATS_CHANGED).toBe("devtools:derived-stats-changed");
  });

  it("notify déclenche les abonnés (recharge serveur, jamais de calcul client)", () => {
    const cb = vi.fn();
    onDerivedStatsChanged(cb);
    notifyDerivedStatsChanged();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("le désabonnement retire l'écouteur", () => {
    const cb = vi.fn();
    const off = onDerivedStatsChanged(cb);
    off();
    notifyDerivedStatsChanged();
    expect(cb).not.toHaveBeenCalled();
  });
});
