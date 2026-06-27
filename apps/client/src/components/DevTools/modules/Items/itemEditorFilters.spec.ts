import { describe, expect, it } from "vitest";
import {
  ALL_FILTER,
  buildItemCreateInput,
  buildItemPatch,
  draftFromItem,
  filterItems,
  isValidItemDraft,
  uniqueSorted,
} from "./itemEditorFilters";
import type { ItemCatalogEntry } from "./itemEditor.types";

const ITEMS: ItemCatalogEntry[] = [
  {
    id: "item-wood",
    name: "Bâton de bois",
    type: "material",
    category: "wooden_stick",
    image: "/assets/images/items/wooden_stick.png",
  },
  {
    id: "item-ore",
    name: "Minerai de fer",
    type: "material",
    category: "iron_ore",
    image: null,
  },
  {
    id: "item-sword",
    name: "Épée basique",
    type: "weapon",
    category: "basic_sword",
    image: null,
  },
];

describe("item editor filters", () => {
  it("filtre par recherche, type et category", () => {
    expect(filterItems(ITEMS, "bois", ALL_FILTER, ALL_FILTER)).toEqual([
      ITEMS[0],
    ]);
    expect(filterItems(ITEMS, "", "material", ALL_FILTER)).toEqual([
      ITEMS[0],
      ITEMS[1],
    ]);
    expect(filterItems(ITEMS, "", ALL_FILTER, "basic_sword")).toEqual([
      ITEMS[2],
    ]);
  });

  it("déduplique et trie les options", () => {
    expect(uniqueSorted(["weapon", "material", "material", "", null])).toEqual([
      "material",
      "weapon",
    ]);
  });

  it("construit un patch minimal depuis le draft", () => {
    const draft = draftFromItem(ITEMS[0]);
    draft.name = "Bâton poli";
    draft.image = " /assets/images/items/wooden_stick.png ";

    expect(buildItemPatch(ITEMS[0], draft)).toEqual({ name: "Bâton poli" });
  });

  it("valide les champs requis", () => {
    expect(isValidItemDraft(draftFromItem(ITEMS[0]))).toBe(true);
    expect(
      isValidItemDraft({ ...draftFromItem(ITEMS[0]), category: " " }),
    ).toBe(false);
  });

  it("construit un payload de création item", () => {
    expect(
      buildItemCreateInput({
        name: "  Bois  ",
        type: " material ",
        category: " wooden_stick ",
        image: " /assets/images/items/wooden_stick.png ",
      }),
    ).toEqual({
      name: "Bois",
      type: "material",
      category: "wooden_stick",
      image: "/assets/images/items/wooden_stick.png",
    });
  });
});
