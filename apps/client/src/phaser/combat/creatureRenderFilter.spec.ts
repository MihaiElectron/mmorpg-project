import { describe, expect, it } from "vitest";
import { isRenderableCreatureState } from "./creatureRenderFilter";

describe("isRenderableCreatureState", () => {
  it("rend les créatures vivantes ET en combat (fighting/escaping)", () => {
    expect(isRenderableCreatureState("alive")).toBe(true);
    expect(isRenderableCreatureState("fighting")).toBe(true);
    expect(isRenderableCreatureState("escaping")).toBe(true);
  });

  it("ne rend jamais les corps (dead)", () => {
    expect(isRenderableCreatureState("dead")).toBe(false);
  });

  it("ignore les états inconnus / absents (défensif)", () => {
    expect(isRenderableCreatureState(undefined)).toBe(false);
    expect(isRenderableCreatureState(null)).toBe(false);
    expect(isRenderableCreatureState("")).toBe(false);
    expect(isRenderableCreatureState("bogus")).toBe(false);
  });
});
