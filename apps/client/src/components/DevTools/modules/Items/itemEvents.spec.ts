import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  notifyItemDefinitionsChanged,
  onItemDefinitionsChanged,
  ITEM_DEFINITIONS_CHANGED,
} from "./itemEvents";

describe("itemEvents", () => {
  beforeEach(() => {
    // EventTarget natif (Node) → addEventListener/dispatchEvent fonctionnels.
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("réutilise le canal existant devtools:items-changed", () => {
    expect(ITEM_DEFINITIONS_CHANGED).toBe("devtools:items-changed");
  });

  it("notify déclenche les abonnés", () => {
    const cb = vi.fn();
    onItemDefinitionsChanged(cb);
    notifyItemDefinitionsChanged();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("le désabonnement retiré l'écouteur", () => {
    const cb = vi.fn();
    const off = onItemDefinitionsChanged(cb);
    off();
    notifyItemDefinitionsChanged();
    expect(cb).not.toHaveBeenCalled();
  });
});
