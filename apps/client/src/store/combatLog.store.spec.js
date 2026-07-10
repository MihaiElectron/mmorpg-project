import { describe, it, expect, beforeEach } from "vitest";
import { getCombatLogStore, MAX_LOG_ENTRIES } from "./combatLog.store";

describe("combatLog.store", () => {
  beforeEach(() => {
    getCombatLogStore().getState().clearLogs();
  });

  it("ajoute une entrée avec category, message, id et createdAt", () => {
    const store = getCombatLogStore();
    store.getState().pushLog({ category: "combat", message: "Vous infligez 8 dégâts à turkey" });
    const entries = store.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ category: "combat", message: "Vous infligez 8 dégâts à turkey" });
    expect(typeof entries[0].id).toBe("number");
    expect(typeof entries[0].createdAt).toBe("number");
  });

  it("ignore un message vide", () => {
    const store = getCombatLogStore();
    store.getState().pushLog({ category: "combat", message: "" });
    store.getState().pushLog({ category: "combat" });
    expect(store.getState().entries).toHaveLength(0);
  });

  it("catégorie par défaut = combat", () => {
    const store = getCombatLogStore();
    store.getState().pushLog({ message: "test" });
    expect(store.getState().entries[0].category).toBe("combat");
  });

  it("severity par défaut = info (rétrocompatible)", () => {
    const store = getCombatLogStore();
    store.getState().pushLog({ category: "combat", message: "sans severity" });
    expect(store.getState().entries[0].severity).toBe("info");
  });

  it("stocke la severity fournie (warn)", () => {
    const store = getCombatLogStore();
    store.getState().pushLog({ category: "combat", message: "avertissement", severity: "warn" });
    expect(store.getState().entries[0].severity).toBe("warn");
  });

  it(`borne le journal à ${MAX_LOG_ENTRIES} entrées (garde les plus récentes)`, () => {
    const store = getCombatLogStore();
    for (let i = 0; i < MAX_LOG_ENTRIES + 50; i++) {
      store.getState().pushLog({ category: "combat", message: `msg-${i}` });
    }
    const entries = store.getState().entries;
    expect(entries).toHaveLength(MAX_LOG_ENTRIES);
    // la première entrée conservée doit être la 51e (0..49 tronquées)
    expect(entries[0].message).toBe("msg-50");
    expect(entries[entries.length - 1].message).toBe(`msg-${MAX_LOG_ENTRIES + 49}`);
  });

  it("clearLogs vide le journal", () => {
    const store = getCombatLogStore();
    store.getState().pushLog({ message: "x" });
    store.getState().clearLogs();
    expect(store.getState().entries).toHaveLength(0);
  });
});
