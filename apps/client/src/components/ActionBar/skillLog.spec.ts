import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getCombatLogStore } from "../../store/combatLog.store";
import { addSkillLog, __resetSkillLogDedupe } from "./skillLog";

// En environnement "node", le store est un singleton attaché à `window`.
// Sans `window`, chaque appel `getCombatLogStore()` créerait un store distinct
// (test vs interne d'addSkillLog). On fournit un `window` stable pour partager
// la même instance, comme en navigateur.
vi.stubGlobal("window", globalThis);

describe("skillLog.addSkillLog", () => {
  beforeEach(() => {
    getCombatLogStore().getState().clearLogs();
    __resetSkillLogDedupe();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("préfixe le message avec [Skill] et pousse en catégorie combat / severity warn", () => {
    addSkillLog("Mana insuffisant.");
    const entries = getCombatLogStore().getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      category: "combat",
      message: "[Skill] Mana insuffisant.",
      severity: "warn",
    });
  });

  it("respecte une severity explicite", () => {
    addSkillLog("Erreur grave", "error");
    expect(getCombatLogStore().getState().entries[0].severity).toBe("error");
  });

  it("déduplique le MÊME message dans la fenêtre de 1000 ms", () => {
    addSkillLog("Sélectionne une créature.");
    addSkillLog("Sélectionne une créature.");
    vi.advanceTimersByTime(500);
    addSkillLog("Sélectionne une créature.");
    expect(getCombatLogStore().getState().entries).toHaveLength(1);
  });

  it("réémet le même message une fois la fenêtre écoulée (> 1000 ms)", () => {
    addSkillLog("Sélectionne une créature.");
    vi.advanceTimersByTime(1001);
    addSkillLog("Sélectionne une créature.");
    expect(getCombatLogStore().getState().entries).toHaveLength(2);
  });

  it("ne déduplique PAS deux messages différents rapprochés", () => {
    addSkillLog("Mana insuffisant.");
    addSkillLog("Cible hors de portée.");
    const messages = getCombatLogStore().getState().entries.map((e) => e.message);
    expect(messages).toEqual(["[Skill] Mana insuffisant.", "[Skill] Cible hors de portée."]);
  });

  it("ignore un message vide", () => {
    addSkillLog("");
    expect(getCombatLogStore().getState().entries).toHaveLength(0);
  });
});
