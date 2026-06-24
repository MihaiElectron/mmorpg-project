import { useEffect, useMemo, useState } from "react";
import { useCharacterStore } from "../../store/character.store";
import {
  buildCraftRequestPayload,
  estimateStationReach,
  filterRecipesForStation,
  type AvailableCraftingRecipe,
  type CraftingStationTarget,
  type CraftResultSnapshot,
} from "./craftingRuntime";

const API = import.meta.env.VITE_API_URL as string;

function itemLabel(itemId: string, recipes: AvailableCraftingRecipe[]): string {
  for (const recipe of recipes) {
    const ing = recipe.ingredients.find((item) => item.itemId === itemId);
    if (ing) return ing.itemName || ing.itemId;
    const res = recipe.results.find((item) => item.itemId === itemId);
    if (res) return res.itemName || res.itemId;
  }
  return itemId;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

type Props = {
  station: CraftingStationTarget;
  onClose: () => void;
};

export default function CraftingRuntimePanel({ station, onClose }: Props) {
  const loadCharacter = useCharacterStore((s) => s.loadCharacter);
  const loadSkills = useCharacterStore((s) => s.loadSkills);
  const character = useCharacterStore((s) => s.character);
  const [recipes, setRecipes] = useState<AvailableCraftingRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [craftingRecipeId, setCraftingRecipeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CraftResultSnapshot | null>(null);

  const stationType = station.stationType ?? station.type;
  const reachEstimate = estimateStationReach(
    character ? { worldX: character.positionX, worldY: character.positionY } : null,
    station,
  );
  const compatibleRecipes = useMemo(
    () => filterRecipesForStation(recipes, stationType),
    [recipes, stationType],
  );

  useEffect(() => {
    const token = localStorage.getItem("token") ?? "";
    if (!token || !stationType) return;

    setLoading(true);
    setError(null);
    fetch(`${API}/crafting/available-recipes?stationType=${encodeURIComponent(stationType)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message ?? `Erreur ${res.status}`);
        return res.json() as Promise<AvailableCraftingRecipe[]>;
      })
      .then(setRecipes)
      .catch((err) => setError(err instanceof Error ? err.message : "Impossible de charger les recettes."))
      .finally(() => setLoading(false));
  }, [stationType]);

  async function craft(recipe: AvailableCraftingRecipe) {
    const token = localStorage.getItem("token") ?? "";
    if (!token) {
      setError("Non authentifié.");
      return;
    }

    setCraftingRecipeId(recipe.id);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API}/crafting/craft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(buildCraftRequestPayload(recipe.id)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? `Erreur ${res.status}`);
      setResult(body as CraftResultSnapshot);
      await Promise.all([loadCharacter(), loadSkills()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Craft impossible.");
    } finally {
      setCraftingRecipeId(null);
    }
  }

  return (
    <div className="action-panel__crafting">
      <div className="action-panel__crafting-header">
        <span className="action-panel__crafting-title">{station.name ?? stationType}</span>
        <button className="action-panel__crafting-close" onClick={onClose} aria-label="Fermer le craft">
          ×
        </button>
      </div>

      <div className={`action-panel__station-range action-panel__station-range--${reachEstimate.status}`}>
        {reachEstimate.status === "unknown" && "Portée estimée indisponible"}
        {reachEstimate.status === "in_range" && "✓ Station à portée"}
        {reachEstimate.status === "out_of_range" && "⚠ Hors de portée estimée"}
        {reachEstimate.distanceWU != null && reachEstimate.radiusWU != null && (
          <span>
            {Math.round(reachEstimate.distanceWU)} / {Math.round(reachEstimate.radiusWU)} WU
          </span>
        )}
      </div>

      {loading && <p className="action-panel__crafting-muted">Chargement des recettes…</p>}
      {error && <p className="action-panel__crafting-error">{error}</p>}

      {!loading && compatibleRecipes.length === 0 && (
        <p className="action-panel__crafting-muted">Aucune recette compatible.</p>
      )}

      <div className="action-panel__recipe-list">
        {compatibleRecipes.map((recipe) => (
          <article key={recipe.id} className="action-panel__recipe">
            <div className="action-panel__recipe-head">
              <span className="action-panel__recipe-name">{recipe.name}</span>
              <span className="action-panel__recipe-rate">Base {percent(recipe.baseSuccessRate)}</span>
            </div>
            <div className="action-panel__recipe-skill">
              {recipe.requiredSkillKey} niv. {recipe.requiredSkillLevel}
            </div>
            <div className="action-panel__recipe-grid">
              <div>
                <span className="action-panel__recipe-label">Ingrédients</span>
                {recipe.ingredients.map((ingredient) => (
                  <span key={ingredient.id} className="action-panel__recipe-line">
                    {ingredient.itemName || ingredient.itemId} ×{ingredient.requiredQuantity}
                  </span>
                ))}
              </div>
              <div>
                <span className="action-panel__recipe-label">Résultats</span>
                {recipe.results.map((recipeResult) => (
                  <span key={recipeResult.id} className="action-panel__recipe-line">
                    {recipeResult.itemName || recipeResult.itemId} ×{recipeResult.producedQuantity}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="action-panel__button"
              disabled={craftingRecipeId === recipe.id}
              onClick={() => craft(recipe)}
            >
              {craftingRecipeId === recipe.id ? "Craft…" : "Craft ×1"}
            </button>
          </article>
        ))}
      </div>

      {result && (
        <div className={`action-panel__craft-result action-panel__craft-result--${result.successes > 0 ? "ok" : "fail"}`}>
          <strong>{result.successes > 0 ? "Craft réussi" : "Craft échoué"}</strong>
          <span>Succès: {result.successes} · Échecs: {result.failures}</span>
          {result.consumed.length > 0 && (
            <span>Consommé: {result.consumed.map((item) => `${itemLabel(item.itemId, recipes)} ×${item.quantity}`).join(", ")}</span>
          )}
          {result.produced.length > 0 && (
            <span>Produit: {result.produced.map((item) => `${itemLabel(item.itemId, recipes)} ×${item.quantity}`).join(", ")}</span>
          )}
          <span>XP: +{result.skill.xpGained} {result.skill.key}</span>
        </div>
      )}
    </div>
  );
}
