import { describe, expect, it } from "vitest";
import { buildSlotMap, MIN_SLOT_COUNT } from "./inventorySlots";

// Entrées projetées : un stack et une instance produisent chacun UNE entrée
// avec un `id` unique (seul champ utilisé par la grille).
function stackEntry(id, quantity = 1) {
  return { id, instanceId: null, quantity, item: { id: `item-${id}` } };
}
function instanceEntry(id) {
  return { id, instanceId: `inst-${id}`, quantity: null, item: { id: `item-${id}` } };
}

function makeEntries(count, prefix = "e") {
  return Array.from({ length: count }, (_, i) => stackEntry(`${prefix}-${i}`));
}

function filledIds(slotMap) {
  return slotMap.filter((id) => id != null);
}

describe("buildSlotMap", () => {
  it("garde 18 slots minimum quand l'inventaire est plus petit", () => {
    const result = buildSlotMap([], makeEntries(3));
    expect(result).toHaveLength(MIN_SLOT_COUNT);
    expect(filledIds(result)).toHaveLength(3);
  });

  it("affiche 18 items sur exactement 18 slots", () => {
    const entries = makeEntries(18);
    const result = buildSlotMap([], entries);
    expect(result).toHaveLength(18);
    expect(new Set(filledIds(result))).toEqual(new Set(entries.map((e) => e.id)));
  });

  it("étend la grille pour 19 items (aucune entrée droppée)", () => {
    const entries = makeEntries(19);
    const result = buildSlotMap([], entries);
    expect(result).toHaveLength(19);
    expect(filledIds(result)).toHaveLength(19);
    for (const entry of entries) {
      expect(result).toContain(entry.id);
    }
  });

  it("un stack compte pour 1 entrée = 1 slot", () => {
    const result = buildSlotMap([], [stackEntry("bois", 999)]);
    expect(filledIds(result)).toEqual(["bois"]);
    expect(result).toHaveLength(MIN_SLOT_COUNT);
  });

  it("une instance compte pour 1 entrée = 1 slot", () => {
    const result = buildSlotMap([], [instanceEntry("epee-1")]);
    expect(filledIds(result)).toEqual(["epee-1"]);
    expect(result).toHaveLength(MIN_SLOT_COUNT);
  });

  it("stacks et instances mélangés : chacun un slot, aucun perdu", () => {
    const entries = [
      stackEntry("bois", 500),
      stackEntry("charbon", 12),
      instanceEntry("epee-1"),
      instanceEntry("epee-2"),
    ];
    const result = buildSlotMap([], entries);
    expect(filledIds(result)).toHaveLength(4);
    expect(new Set(filledIds(result))).toEqual(
      new Set(["bois", "charbon", "epee-1", "epee-2"]),
    );
  });

  it("ne perd jamais une entrée même largement au-delà de 18", () => {
    const entries = makeEntries(50);
    const result = buildSlotMap([], entries);
    expect(result).toHaveLength(50);
    expect(new Set(filledIds(result))).toEqual(new Set(entries.map((e) => e.id)));
  });

  it("conserve la position de session d'une entrée existante", () => {
    const prev = new Array(MIN_SLOT_COUNT).fill(null);
    prev[5] = "a";
    const result = buildSlotMap(prev, [stackEntry("a"), stackEntry("b")]);
    expect(result[5]).toBe("a");
    expect(result).toContain("b");
    expect(filledIds(result)).toHaveLength(2);
  });

  it("purge les ids de slots qui ne sont plus dans l'inventaire", () => {
    const prev = new Array(MIN_SLOT_COUNT).fill(null);
    prev[0] = "disparu";
    prev[1] = "present";
    const result = buildSlotMap(prev, [stackEntry("present")]);
    expect(result).not.toContain("disparu");
    expect(result[1]).toBe("present");
  });

  it("revient au minimum 18 slots quand l'inventaire diminue", () => {
    const big = makeEntries(30);
    const grown = buildSlotMap([], big);
    expect(grown).toHaveLength(30);
    const shrunk = buildSlotMap(grown, makeEntries(2));
    expect(shrunk).toHaveLength(MIN_SLOT_COUNT);
    expect(filledIds(shrunk)).toHaveLength(2);
  });

  it("re-place une entrée dont la position mémorisée dépasse la grille", () => {
    const prev = new Array(31).fill(null);
    prev[30] = "x";
    const result = buildSlotMap(prev, [stackEntry("x")]);
    expect(result).toHaveLength(MIN_SLOT_COUNT); // grille ramenée au minimum
    expect(result).toContain("x"); // mais l'entrée n'est pas perdue
    expect(filledIds(result)).toEqual(["x"]);
  });
});
