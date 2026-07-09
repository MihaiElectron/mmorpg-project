import { describe, it, expect } from "vitest";
import {
  emptyBuffer,
  totalAllocated,
  remainingPoints,
  increment,
  decrement,
  buildAllocationPayload,
  STAT_FIELDS,
} from "./statsAllocation";

describe("statsAllocation", () => {
  it("emptyBuffer initialise les 10 stats à 0", () => {
    const b = emptyBuffer();
    expect(Object.keys(b)).toHaveLength(STAT_FIELDS.length);
    expect(totalAllocated(b)).toBe(0);
  });

  it("increment consomme un point disponible", () => {
    const b = increment(emptyBuffer(), "strength", 5);
    expect(b.strength).toBe(1);
    expect(totalAllocated(b)).toBe(1);
    expect(remainingPoints(5, b)).toBe(4);
  });

  it("increment ne dépasse jamais les points disponibles", () => {
    let b = emptyBuffer();
    b = increment(b, "strength", 1);
    const before = b;
    b = increment(b, "vitality", 1); // plus aucun point dispo
    expect(b).toBe(before); // buffer inchangé (même référence)
    expect(totalAllocated(b)).toBe(1);
  });

  it("decrement rend un point local", () => {
    let b = increment(emptyBuffer(), "strength", 5);
    b = increment(b, "strength", 5);
    expect(b.strength).toBe(2);
    b = decrement(b, "strength");
    expect(b.strength).toBe(1);
  });

  it("decrement ne descend jamais sous 0", () => {
    const b = emptyBuffer();
    const after = decrement(b, "strength");
    expect(after).toBe(b); // inchangé
  });

  it("buildAllocationPayload ne contient que les stats > 0", () => {
    let b = emptyBuffer();
    b = increment(b, "strength", 5);
    b = increment(b, "strength", 5);
    b = increment(b, "charisma", 5);
    const payload = buildAllocationPayload(b);
    expect(payload).toEqual({ strength: 2, charisma: 1 });
  });

  it("buildAllocationPayload est vide si rien à envoyer", () => {
    expect(buildAllocationPayload(emptyBuffer())).toEqual({});
  });

  it("remainingPoints soustrait le buffer des points serveur", () => {
    let b = increment(emptyBuffer(), "agility", 10);
    b = increment(b, "wisdom", 10);
    expect(remainingPoints(10, b)).toBe(8);
  });
});
