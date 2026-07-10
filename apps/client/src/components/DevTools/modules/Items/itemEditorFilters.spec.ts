import { describe, expect, it } from "vitest";
import {
  ALL_FILTER,
  buildItemCreateInput,
  buildItemPatch,
  describeRange,
  draftFromItem,
  filterItems,
  isRangeInvalid,
  isValidItemDraft,
  meleeRangeWarning,
  rangePxToWU,
  uniqueSorted,
} from "./itemEditorFilters";
import type { ItemCatalogEntry, ItemEditorDraft } from "./itemEditor.types";

function makeDraft(overrides: Partial<ItemEditorDraft> = {}): ItemEditorDraft {
  return {
    name: "Épée", type: "weapon", category: "basic_sword", image: "",
    objectMode: "INSTANCE", slot: "right-hand", attack: "", defense: "",
    range: "", weaponType: "", ...overrides,
  };
}

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

  it("détecte un changement de statBonuses (JSONB) dans le patch", () => {
    const item = { ...ITEMS[2], statBonuses: { strength: 3 } } as ItemCatalogEntry;
    const draft = draftFromItem(item);
    draft.statBonuses = { ...draft.statBonuses, strength: "5" };
    expect(buildItemPatch(item, draft)).toEqual({ statBonuses: { strength: 5 } });
  });

  it("ne marque pas dirty si statBonuses équivalent (ordre de clés indifférent)", () => {
    const item = { ...ITEMS[2], statBonuses: { strength: 3, vitality: 2 } } as ItemCatalogEntry;
    const draft = draftFromItem(item);
    expect(buildItemPatch(item, draft)).toEqual({});
  });

  it("détecte requiredLevel et requiredClass modifiés", () => {
    const item = { ...ITEMS[2], requiredLevel: 1, requiredClass: null } as ItemCatalogEntry;
    const draft = draftFromItem(item);
    draft.requiredLevel = "5";
    draft.requiredClass = "guerrier";
    expect(buildItemPatch(item, draft)).toEqual({ requiredLevel: 5, requiredClass: "guerrier" });
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

  // ── Portée d'arme : conversion, validation, avertissement ─────────────────
  describe("portée d'arme", () => {
    it("un champ range vide reste null (jamais 0) dans le payload de création", () => {
      const input = buildItemCreateInput(makeDraft({ range: "" }));
      expect(input.range).toBeUndefined();
    });

    it("ne crash pas et omet slot si slot/weaponType non string (draft partiel)", () => {
      // Draft partiel : slot, weaponType, attack… absents (undefined).
      const input = buildItemCreateInput({
        name: "Bois",
        type: "material",
        category: "wooden_stick",
      } as unknown as Parameters<typeof buildItemCreateInput>[0]);
      expect(input).toEqual({ name: "Bois", type: "material", category: "wooden_stick" });
      expect(input.slot).toBeUndefined();
    });

    it("convertit px → WU (×16) → tuiles", () => {
      expect(rangePxToWU(46)).toBe(736);
      const d46 = describeRange("46");
      expect(d46).toEqual({ px: 46, wu: 736, tiles: 736 / 1024 });
      expect(d46!.tiles).toBeCloseTo(0.72, 2);
      expect(describeRange("80")).toEqual({ px: 80, wu: 1280, tiles: 1.25 });
    });

    it("describeRange retourne null pour un champ vide", () => {
      expect(describeRange("")).toBeNull();
    });

    it("range 0 / négatif / non entier est invalide, vide et >=1 valides", () => {
      expect(isRangeInvalid("0")).toBe(true);
      expect(isRangeInvalid("-3")).toBe(true);
      expect(isRangeInvalid("46.5")).toBe(true);
      expect(isRangeInvalid("")).toBe(false);
      expect(isRangeInvalid("1")).toBe(false);
      expect(isRangeInvalid("80")).toBe(false);
    });

    it("avertit pour une arme de mêlée avec range < 80", () => {
      expect(meleeRangeWarning(makeDraft({ range: "46" }))).toMatch(/attaques adjacentes/i);
      expect(meleeRangeWarning(makeDraft({ range: "80" }))).toBeNull();
      expect(meleeRangeWarning(makeDraft({ range: "" }))).toBeNull();
    });

    it("n'avertit pas pour une arme à distance ni pour un non-arme", () => {
      expect(meleeRangeWarning(makeDraft({ range: "20", slot: "ranged-weapon" }))).toBeNull();
      expect(meleeRangeWarning(makeDraft({ range: "20", type: "material", slot: "" }))).toBeNull();
    });
  });
});
