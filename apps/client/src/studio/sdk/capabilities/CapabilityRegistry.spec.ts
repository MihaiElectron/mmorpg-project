import { describe, it, expect, beforeEach } from "vitest";
import { CapabilityRegistry } from "./CapabilityRegistry";
import type { CapabilityProvider } from "./CapabilityProvider";
import type { WorldObject } from "../../../components/DevTools/types/worldObject.types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProvider(capabilities: string[]): CapabilityProvider {
  return { capabilities };
}

function makeWorldObject(capabilities: string[]): WorldObject {
  return {
    kind: "entity",
    category: "resource",
    id: "test-id",
    type: "dead_tree",
    mapId: 1,
    position: null,
    state: "alive",
    capabilities,
    metadata: {},
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CapabilityRegistry", () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  describe("register + getProviders", () => {
    it("provider enregistré retrouvé par capability exacte", () => {
      const p = makeProvider(["validation"]);
      registry.register(p);
      expect(registry.getProviders(["validation"])).toContain(p);
    });

    it("provider non enregistré absent du résultat", () => {
      const p = makeProvider(["validation"]);
      registry.register(p);
      expect(registry.getProviders(["overlay"])).toHaveLength(0);
    });

    it("capability inconnue → tableau vide", () => {
      registry.register(makeProvider(["validation"]));
      expect(registry.getProviders(["unknown_cap"])).toHaveLength(0);
    });

    it("tableau de capabilities vide → tableau vide", () => {
      registry.register(makeProvider(["validation"]));
      expect(registry.getProviders([])).toHaveLength(0);
    });
  });

  describe("getProviders — correspondance partielle", () => {
    it("provider matché si au moins une capability correspond", () => {
      const p = makeProvider(["loot", "validation"]);
      registry.register(p);
      expect(registry.getProviders(["validation"])).toContain(p);
      expect(registry.getProviders(["loot"])).toContain(p);
    });

    it("provider non matché si aucune capability ne correspond", () => {
      const p = makeProvider(["loot", "validation"]);
      registry.register(p);
      expect(registry.getProviders(["overlay", "commands"])).toHaveLength(0);
    });
  });

  describe("plusieurs providers", () => {
    it("retourne uniquement les providers qui correspondent", () => {
      const p1 = makeProvider(["validation"]);
      const p2 = makeProvider(["overlay"]);
      const p3 = makeProvider(["commands"]);
      registry.register(p1);
      registry.register(p2);
      registry.register(p3);

      const result = registry.getProviders(["validation"]);
      expect(result).toContain(p1);
      expect(result).not.toContain(p2);
      expect(result).not.toContain(p3);
    });

    it("retourne plusieurs providers si tous correspondent", () => {
      const p1 = makeProvider(["validation"]);
      const p2 = makeProvider(["validation", "loot"]);
      registry.register(p1);
      registry.register(p2);

      const result = registry.getProviders(["validation"]);
      expect(result).toHaveLength(2);
      expect(result).toContain(p1);
      expect(result).toContain(p2);
    });
  });

  describe("ordre stable", () => {
    it("providers retournés dans l'ordre d'inscription", () => {
      const p1 = makeProvider(["validation"]);
      const p2 = makeProvider(["validation"]);
      const p3 = makeProvider(["validation"]);
      registry.register(p1);
      registry.register(p2);
      registry.register(p3);

      const result = registry.getProviders(["validation"]);
      expect(result[0]).toBe(p1);
      expect(result[1]).toBe(p2);
      expect(result[2]).toBe(p3);
    });
  });

  describe("getProvidersFor", () => {
    it("délègue vers getProviders(obj.capabilities)", () => {
      const p = makeProvider(["validation"]);
      registry.register(p);

      const obj = makeWorldObject(["transform", "validation", "loot"]);
      expect(registry.getProvidersFor(obj)).toContain(p);
    });

    it("WorldObject sans capability correspondante → tableau vide", () => {
      registry.register(makeProvider(["validation"]));
      const obj = makeWorldObject(["transform", "loot"]);
      expect(registry.getProvidersFor(obj)).toHaveLength(0);
    });

    it("WorldObject sans capabilities → tableau vide", () => {
      registry.register(makeProvider(["validation"]));
      const obj = makeWorldObject([]);
      expect(registry.getProvidersFor(obj)).toHaveLength(0);
    });
  });
});
