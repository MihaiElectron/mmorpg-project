import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cooldownRemainingBucket,
  buildCastSuccessMessage,
  BAR_POSITIONS,
  nextBarPosition,
  loadBarPosition,
  saveBarPosition,
} from "./skillActionBar.helpers";

describe("cooldownRemainingBucket", () => {
  it("retourne 100 au tout début du cooldown", () => {
    expect(cooldownRemainingBucket(3000, 3000)).toBe(100);
  });

  it("retourne ~50 à la moitié (arrondi au palier de 5)", () => {
    expect(cooldownRemainingBucket(1500, 3000)).toBe(50);
  });

  it("arrondit au palier de 5 le plus proche", () => {
    // 1400/3000 = 46.6% → arrondi 45
    expect(cooldownRemainingBucket(1400, 3000)).toBe(45);
  });

  it("retourne 0 quand il ne reste plus rien", () => {
    expect(cooldownRemainingBucket(0, 3000)).toBe(0);
  });

  it("retourne 0 sans division par zéro si total <= 0", () => {
    expect(cooldownRemainingBucket(1000, 0)).toBe(0);
  });

  it("plafonne à 100 si remaining dépasse total", () => {
    expect(cooldownRemainingBucket(5000, 3000)).toBe(100);
  });
});

describe("buildCastSuccessMessage", () => {
  it("cible soi-même", () => {
    expect(buildCastSuccessMessage("Soin", "self")).toBe("Soin utilisé sur soi-même.");
  });

  it("cible créature avec label", () => {
    expect(buildCastSuccessMessage("Frappe", "creature", "turkey")).toBe(
      "Frappe utilisé sur turkey.",
    );
  });

  it("cible créature sans label → fallback sobre", () => {
    expect(buildCastSuccessMessage("Frappe", "creature")).toBe("Frappe utilisé.");
  });

  it("nom de skill vide → fallback Skill", () => {
    expect(buildCastSuccessMessage("", "self")).toBe("Skill utilisé sur soi-même.");
  });
});

describe("positions de la SkillActionBar", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("nextBarPosition cycle et boucle après la dernière", () => {
    expect(nextBarPosition("bottom-left")).toBe("bottom-center");
    expect(nextBarPosition("bottom-center")).toBe("bottom-right");
    expect(nextBarPosition("top-right")).toBe("bottom-left"); // wrap
  });

  it("saveBarPosition persiste puis loadBarPosition restaure", () => {
    saveBarPosition("top-center");
    expect(loadBarPosition()).toBe("top-center");
  });

  it("loadBarPosition → fallback bottom-left si valeur absente", () => {
    expect(loadBarPosition()).toBe("bottom-left");
  });

  it("loadBarPosition → fallback bottom-left si valeur invalide", () => {
    store["skillActionBarPosition"] = "somewhere-else";
    expect(loadBarPosition()).toBe("bottom-left");
  });

  it("toutes les positions attendues sont exposées", () => {
    expect(BAR_POSITIONS).toEqual([
      "bottom-left",
      "bottom-center",
      "bottom-right",
      "top-left",
      "top-center",
      "top-right",
    ]);
  });
});
