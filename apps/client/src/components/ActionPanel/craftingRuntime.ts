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
  requiredQuantity: number;
};

export type CraftingRecipeResult = {
  id: string;
  itemId: string;
  itemName?: string;
  itemCategory?: string;
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
  skill: {
    key: string;
    previousLevel: number;
    newLevel: number;
    previousXp: number;
    newXp: number;
    xpGained: number;
    nextLevelXp: number;
  };
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

export function buildCraftRequestPayload(recipeId: string): { recipeId: string; quantity: 1 } {
  return { recipeId, quantity: 1 };
}

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
