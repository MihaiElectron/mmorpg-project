import { describe, expect, it } from "vitest";
import {
  buildLootPoolPatch,
  buildLootPoolSources,
  findItemByLootRef,
  normalizeLootPool,
  validateLootPool,
} from "./lootPoolEditor";
import type { ItemCatalogEntry } from "../Items/itemEditor.types";

const ITEMS: ItemCatalogEntry[] = [
  {
    id: "item-wooden-stick",
    name: "Baton de bois",
    type: "material",
    category: "wooden_stick",
    image: "/assets/images/items/wooden_stick.png",
  },
  {
    id: "item-iron-ore",
    name: "Minerai de fer",
    type: "material",
    category: "iron_ore",
    image: "/assets/images/items/iron_ore.png",
  },
];

describe("lootPool editor helpers", () => {
  it("normalise les loot pools runtime en draft editable", () => {
    expect(
      normalizeLootPool([
        { itemId: "wooden_stick", minQty: "2", maxQty: 5, probability: "0.5" },
        null,
      ]),
    ).toEqual([
      { itemId: "wooden_stick", minQty: 2, maxQty: 5, probability: 0.5 },
    ]);
  });

  it("construit les sources resources et creatures", () => {
    const sources = buildLootPoolSources(
      [{ type: "dead_tree", lootPool: [{ itemId: "wooden_stick", minQty: 1, maxQty: 3, probability: 1 }] }],
      [{ key: "turkey", name: "Turkey", lootPool: [] }],
    );

    expect(sources.map((source) => source.id)).toEqual([
      "creature:turkey",
      "resource:dead_tree",
    ]);
  });

  it("retrouve un item par category ou id", () => {
    expect(findItemByLootRef(ITEMS, "wooden_stick")?.id).toBe("item-wooden-stick");
    expect(findItemByLootRef(ITEMS, "item-iron-ore")?.category).toBe("iron_ore");
  });

  it("valide une entree lootPool canonique", () => {
    const result = validateLootPool(
      [{ itemId: "wooden_stick", minQty: 1, maxQty: 3, probability: 0.75 }],
      ITEMS,
    );

    expect(result.valid).toBe(true);
  });

  it("signale les entrees invalides avant sauvegarde", () => {
    const result = validateLootPool(
      [{ itemId: "missing", minQty: 0, maxQty: -1, probability: 0 }],
      ITEMS,
    );

    expect(result.valid).toBe(false);
    expect(result.errorsByIndex[0]).toEqual([
      "Item inconnu",
      "Min >= 1",
      "Max >= min",
      "Proba > 0 et <= 1",
    ]);
  });

  it("construit un patch normalise", () => {
    expect(
      buildLootPoolPatch([
        { itemId: " wooden_stick ", minQty: 1, maxQty: 1, probability: 1 },
      ]),
    ).toEqual([{ itemId: "wooden_stick", minQty: 1, maxQty: 1, probability: 1 }]);
  });
});
