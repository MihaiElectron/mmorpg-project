export type CraftingStationTarget = {
  id: string;
  kind: "crafting_station";
  type: string;
  name?: string;
  stationType?: string;
  worldX?: number;
  worldY?: number;
  interactionRadiusWU?: number;
  enabled?: boolean;
};

export type CraftingRecipeIngredient = {
  id: string;
  itemId: string;
  itemName?: string;
  itemCategory?: string;
  itemImage?: string | null;
  requiredQuantity: number;
};

export type CraftingRecipeResult = {
  id: string;
  itemId: string;
  itemName?: string;
  itemCategory?: string;
  itemImage?: string | null;
  producedQuantity: number;
  chance: number;
};

export type AvailableCraftingRecipe = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  requiredSkillKey: string;
  requiredSkillLevel: number;
  baseSuccessRate: number;
  successBonusPerLevel: number;
  minSuccessRate: number;
  maxSuccessRate: number;
  xpReward: number;
  craftTimeMs: number;
  craftCharacterXpReward: number;
  craftingDifficulty: number;
  stationType: string;
  ingredients: CraftingRecipeIngredient[];
  results: CraftingRecipeResult[];
};

export type CraftResultSnapshot = {
  recipeId: string;
  recipeKey: string;
  requestedQuantity: number;
  attempts: number;
  successes: number;
  failures: number;
  consumed: { itemId: string; quantity: number }[];
  produced: { itemId: string; quantity: number }[];
  // Skill XP Runtime (ADR-0016) — null si aucune XP (0 succès / skill non résolu).
  skill: {
    key: string;
    previousLevel: number;
    newLevel: number;
    previousXp: number;
    newXp: number;
    xpGained: number;
    nextLevelXp: number;
  } | null;
  // Character XP portée par la recette — null si aucune.
  characterXp: {
    level: number;
    experience: number;
    nextLevelXp: number;
    leveledUp: boolean;
    xpGained: number;
  } | null;
};

export type WorldPositionWU = {
  worldX?: number | null;
  worldY?: number | null;
};

export type StationReachEstimate =
  | {
      status: "unknown";
      distanceWU: null;
      radiusWU: null;
      inRange: null;
    }
  | {
      status: "in_range" | "out_of_range";
      distanceWU: number;
      radiusWU: number;
      inRange: boolean;
    };

export type CraftingServerError = {
  code?: string;
  message: string;
  stationType?: string;
  nearestDistanceWU?: number;
  requiredRadiusWU?: number;
};

/** Borne serveur (CraftRequestDto @Max(99)). */
export const CRAFT_MAX_QUANTITY = 99;

export function buildCraftRequestPayload(
  recipeId: string,
  quantity = 1,
): { recipeId: string; quantity: number } {
  const bounded = Math.max(1, Math.min(CRAFT_MAX_QUANTITY, Math.floor(quantity) || 1));
  return { recipeId, quantity: bounded };
}

/** Ligne d'inventaire minimale telle qu'exposée par character.store. */
export type InventoryLike = {
  item?: { id?: string | null } | null;
  quantity?: number | null;
};

/** Somme des quantités possédées pour un itemId (STACKABLE et INSTANCE confondus). */
export function countOwned(inventory: InventoryLike[] | null | undefined, itemId: string): number {
  if (!inventory) return 0;
  let total = 0;
  for (const row of inventory) {
    if (row?.item?.id === itemId) total += Number(row.quantity ?? 0);
  }
  return total;
}

/** Détail d'un ingrédient face à l'inventaire du joueur. */
export type IngredientAvailability = {
  itemId: string;
  itemName: string;
  itemImage: string | null;
  owned: number;
  required: number;
  enough: boolean;
};

/**
 * Disponibilité des ingrédients pour `quantity` crafts, calculée uniquement
 * depuis l'inventaire déjà chargé. Aucun appel serveur.
 */
export function ingredientAvailability(
  recipe: AvailableCraftingRecipe,
  inventory: InventoryLike[] | null | undefined,
  quantity: number,
): IngredientAvailability[] {
  const q = Math.max(1, Math.floor(quantity) || 1);
  return recipe.ingredients.map((ing) => {
    const owned = countOwned(inventory, ing.itemId);
    const required = ing.requiredQuantity * q;
    return {
      itemId: ing.itemId,
      itemName: ing.itemName || ing.itemId,
      itemImage: ing.itemImage ?? null,
      owned,
      required,
      enough: owned >= required,
    };
  });
}

/**
 * Nombre maximum de crafts réalisables avec l'inventaire courant.
 * Sans ingrédient : borne serveur. Sinon min(⌊possédé/requis⌋) borné à 99.
 */
export function computeMaxCraftable(
  recipe: AvailableCraftingRecipe,
  inventory: InventoryLike[] | null | undefined,
): number {
  if (recipe.ingredients.length === 0) return CRAFT_MAX_QUANTITY;
  let max = CRAFT_MAX_QUANTITY;
  for (const ing of recipe.ingredients) {
    const owned = countOwned(inventory, ing.itemId);
    const perCraft = ing.requiredQuantity > 0 ? Math.floor(owned / ing.requiredQuantity) : 0;
    if (perCraft < max) max = perCraft;
  }
  return Math.max(0, Math.min(CRAFT_MAX_QUANTITY, max));
}

/** Produit "face" d'une recette (premier résultat) pour une UI orientée produit. */
export function recipeProduct(recipe: AvailableCraftingRecipe): CraftingRecipeResult | null {
  return recipe.results[0] ?? null;
}

/** Libellé produit : nom de l'item output, sinon nom de la recette. */
export function recipeProductLabel(recipe: AvailableCraftingRecipe): string {
  return recipeProduct(recipe)?.itemName || recipe.name;
}

/**
 * Recherche instantanée sur le nom du produit, la catégorie de recette et la
 * catégorie/le type de l'item produit. Query vide → toujours vrai.
 */
export function matchesRecipeQuery(recipe: AvailableCraftingRecipe, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const product = recipeProduct(recipe);
  const haystack = [
    recipeProductLabel(recipe),
    recipe.name,
    recipe.category,
    product?.itemCategory ?? "",
    recipe.requiredSkillKey,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * Estimation lecture seule de la Skill XP par craft — miroir EXACT du Runtime
 * (skill-xp-calculator : domain=crafting, action=craft → base 15 ; bonus =
 * floor(difficulty/10) ; quality null). Affichage uniquement : la valeur
 * autoritaire reste calculée côté serveur.
 */
export function estimateCraftSkillXp(craftingDifficulty: number): number {
  const d = Math.max(0, Math.min(100, Math.floor(craftingDifficulty) || 0));
  return Math.max(1, 15 + Math.floor(d / 10));
}

/** Temps de craft (ms) → libellé secondes lisible, pour une durée unitaire ou totale. */
export function formatCraftSeconds(craftTimeMs: number, quantity = 1): string {
  const totalMs = Math.max(0, craftTimeMs) * Math.max(1, Math.floor(quantity) || 1);
  if (totalMs <= 0) return "instantané";
  const seconds = totalMs / 1000;
  const rounded = seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10;
  return `${rounded} s`;
}

/**
 * Recettes visibles pour une station : règle métier stricte, stationType exact.
 * Les recettes non-craftables (ingrédients manquants) restent visibles — c'est
 * le bouton Fabriquer qui est désactivé côté UI, jamais la liste qui les filtre.
 */
export function filterRecipesForStation(
  recipes: AvailableCraftingRecipe[],
  stationType: string | null | undefined,
): AvailableCraftingRecipe[] {
  if (!stationType) return [];
  return recipes.filter((recipe) => recipe.stationType === stationType);
}

export function stationActionLabel(station: Pick<CraftingStationTarget, "name" | "stationType" | "type">): string {
  const raw = station.name || station.stationType || station.type || "station";
  const label = raw.replace(/_/g, " ");
  return `Ouvrir ${label}`;
}

export function distanceWU(a: WorldPositionWU, b: WorldPositionWU): number | null {
  const ax = Number(a.worldX);
  const ay = Number(a.worldY);
  const bx = Number(b.worldX);
  const by = Number(b.worldY);
  if (![ax, ay, bx, by].every(Number.isFinite)) return null;
  return Math.hypot(ax - bx, ay - by);
}

export function estimateStationReach(
  player: WorldPositionWU | null | undefined,
  station: CraftingStationTarget,
): StationReachEstimate {
  if (!player) return { status: "unknown", distanceWU: null, radiusWU: null, inRange: null };

  const radiusWU = Number(station.interactionRadiusWU);
  const computedDistance = distanceWU(player, station);
  if (!Number.isFinite(radiusWU) || radiusWU <= 0 || computedDistance == null) {
    return { status: "unknown", distanceWU: null, radiusWU: null, inRange: null };
  }

  const inRange = computedDistance <= radiusWU;
  return {
    status: inRange ? "in_range" : "out_of_range",
    distanceWU: computedDistance,
    radiusWU,
    inRange,
  };
}

export function parseCraftingServerError(body: unknown, fallbackMessage: string): CraftingServerError {
  if (!body || typeof body !== "object") return { message: fallbackMessage };

  const data = body as Record<string, unknown>;
  const message =
    typeof data.message === "string"
      ? data.message
      : Array.isArray(data.message)
        ? data.message.join(", ")
        : fallbackMessage;

  return {
    message,
    code: typeof data.code === "string" ? data.code : undefined,
    stationType: typeof data.stationType === "string" ? data.stationType : undefined,
    nearestDistanceWU: numberOrUndefined(data.nearestDistanceWU),
    requiredRadiusWU: numberOrUndefined(data.requiredRadiusWU),
  };
}

export function formatCraftingServerErrorDetail(error: CraftingServerError): string | null {
  if (error.nearestDistanceWU == null || error.requiredRadiusWU == null) return null;
  return `Distance : ${Math.round(error.nearestDistanceWU)} WU / portée : ${Math.round(error.requiredRadiusWU)} WU`;
}

function numberOrUndefined(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}
