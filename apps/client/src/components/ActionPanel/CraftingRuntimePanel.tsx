import { useEffect, useMemo, useState } from "react";
import { useCharacterStore } from "../../store/character.store";
import {
  buildCraftRequestPayload,
  computeMaxCraftable,
  estimateCraftSkillXp,
  estimateStationReach,
  filterRecipesForStation,
  formatCraftingServerErrorDetail,
  formatCraftSeconds,
  ingredientAvailability,
  matchesRecipeQuery,
  parseCraftingServerError,
  recipeProduct,
  recipeProductLabel,
  CRAFT_MAX_QUANTITY,
  type AvailableCraftingRecipe,
  type CraftingServerError,
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
  const inventory = useCharacterStore((s) => s.inventory);
  const [recipes, setRecipes] = useState<AvailableCraftingRecipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [craftingRecipeId, setCraftingRecipeId] = useState<string | null>(null);
  const [error, setError] = useState<CraftingServerError | null>(null);
  const [result, setResult] = useState<CraftResultSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  const stationType = station.stationType ?? station.type;
  const reachEstimate = estimateStationReach(
    character ? { worldX: character.positionX, worldY: character.positionY } : null,
    station,
  );
  const compatibleRecipes = useMemo(
    () => filterRecipesForStation(recipes, stationType),
    [recipes, stationType],
  );
  const filteredRecipes = useMemo(
    () => compatibleRecipes.filter((recipe) => matchesRecipeQuery(recipe, query)),
    [compatibleRecipes, query],
  );
  const selectedRecipe = useMemo(
    () => filteredRecipes.find((recipe) => recipe.id === selectedRecipeId) ?? null,
    [filteredRecipes, selectedRecipeId],
  );
  const maxCraftable = selectedRecipe ? computeMaxCraftable(selectedRecipe, inventory) : 0;
  const ingredients = useMemo(
    () => (selectedRecipe ? ingredientAvailability(selectedRecipe, inventory, quantity) : []),
    [selectedRecipe, inventory, quantity],
  );
  const hasEnough = ingredients.every((ing) => ing.enough);
  const outOfRange = reachEstimate.status === "out_of_range";
  const isCrafting = selectedRecipe ? craftingRecipeId === selectedRecipe.id : false;
  const canCraft = Boolean(selectedRecipe) && hasEnough && quantity >= 1 && !outOfRange && !isCrafting;
  const errorDetail = error ? formatCraftingServerErrorDetail(error) : null;

  useEffect(() => {
    const token = localStorage.getItem("token") ?? "";
    if (!token || !stationType) return;

    setLoading(true);
    setError(null);
    fetch(`${API}/crafting/available-recipes?stationType=${encodeURIComponent(stationType)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw parseCraftingServerError(await res.json().catch(() => ({})), `Erreur ${res.status}`);
        return res.json() as Promise<AvailableCraftingRecipe[]>;
      })
      .then(setRecipes)
      .catch((err) => setError(isCraftingServerError(err) ? err : { message: "Impossible de charger les recettes." }))
      .finally(() => setLoading(false));
  }, [stationType]);

  // Sélection auto : garde une recette valide sélectionnée quand la liste change.
  useEffect(() => {
    if (filteredRecipes.length === 0) {
      if (selectedRecipeId !== null) setSelectedRecipeId(null);
      return;
    }
    if (!filteredRecipes.some((recipe) => recipe.id === selectedRecipeId)) {
      setSelectedRecipeId(filteredRecipes[0].id);
    }
  }, [filteredRecipes, selectedRecipeId]);

  // Reset quantité au changement de recette.
  useEffect(() => {
    setQuantity(1);
  }, [selectedRecipeId]);

  function clampQuantity(next: number): number {
    if (!Number.isFinite(next)) return 1;
    return Math.max(1, Math.min(CRAFT_MAX_QUANTITY, Math.floor(next)));
  }

  async function craft(recipe: AvailableCraftingRecipe) {
    const token = localStorage.getItem("token") ?? "";
    if (!token) {
      setError({ message: "Non authentifié." });
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
        body: JSON.stringify(buildCraftRequestPayload(recipe.id, quantity)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw parseCraftingServerError(body, `Erreur ${res.status}`);
      setResult(body as CraftResultSnapshot);
      await Promise.all([loadCharacter(), loadSkills()]);
    } catch (err) {
      setError(isCraftingServerError(err) ? err : { message: "Craft impossible." });
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
      {error && (
        <div className="action-panel__crafting-error">
          <span>{error.message}</span>
          {errorDetail && <span className="action-panel__crafting-error-detail">{errorDetail}</span>}
        </div>
      )}

      {!loading && compatibleRecipes.length === 0 && (
        <p className="action-panel__crafting-muted">Aucun objet fabriquable ici.</p>
      )}

      {!loading && compatibleRecipes.length > 0 && (
        <>
          <input
            className="action-panel__craft-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un objet…"
            aria-label="Rechercher un objet à fabriquer"
          />

          {filteredRecipes.length === 0 ? (
            <p className="action-panel__crafting-muted">Aucun objet ne correspond à « {query} ».</p>
          ) : (
            <ul className="action-panel__craft-list">
              {filteredRecipes.map((recipe) => {
                const product = recipeProduct(recipe);
                const selected = recipe.id === selectedRecipeId;
                return (
                  <li key={recipe.id}>
                    <button
                      type="button"
                      className={`action-panel__craft-list-item${selected ? " is-selected" : ""}`}
                      onClick={() => setSelectedRecipeId(recipe.id)}
                    >
                      {product?.itemImage && (
                        <img className="action-panel__craft-list-img" src={product.itemImage} alt="" aria-hidden="true" />
                      )}
                      <span className="action-panel__craft-list-name">{recipeProductLabel(recipe)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {selectedRecipe && (
        <div className="action-panel__craft-detail">
          <div className="action-panel__craft-product">
            {recipeProduct(selectedRecipe)?.itemImage && (
              <img
                className="action-panel__craft-product-img"
                src={recipeProduct(selectedRecipe)!.itemImage!}
                alt=""
                aria-hidden="true"
              />
            )}
            <div className="action-panel__craft-product-copy">
              <span className="action-panel__craft-product-name">{recipeProductLabel(selectedRecipe)}</span>
              {selectedRecipe.description && (
                <span className="action-panel__craft-product-desc">{selectedRecipe.description}</span>
              )}
            </div>
          </div>

          <dl className="action-panel__craft-meta">
            <div>
              <dt>Temps estimé</dt>
              <dd>{formatCraftSeconds(selectedRecipe.craftTimeMs, quantity)}</dd>
            </div>
            <div>
              <dt>Difficulté</dt>
              <dd>{selectedRecipe.craftingDifficulty} / 100</dd>
            </div>
            <div>
              <dt>Skill requis</dt>
              <dd>
                {selectedRecipe.requiredSkillKey} niv. {selectedRecipe.requiredSkillLevel} · succès {percent(selectedRecipe.baseSuccessRate)}
              </dd>
            </div>
            <div>
              <dt>XP perso</dt>
              <dd>+{selectedRecipe.craftCharacterXpReward}</dd>
            </div>
            <div>
              <dt>XP skill est.</dt>
              <dd>+{estimateCraftSkillXp(selectedRecipe.craftingDifficulty)} {selectedRecipe.requiredSkillKey}</dd>
            </div>
          </dl>

          <div className="action-panel__craft-ingredients">
            <span className="action-panel__craft-section-label">Ingrédients</span>
            {ingredients.length === 0 && (
              <span className="action-panel__crafting-muted">Aucun ingrédient requis.</span>
            )}
            {ingredients.map((ing) => (
              <span
                key={ing.itemId}
                className={`action-panel__craft-ing action-panel__craft-ing--${ing.enough ? "ok" : "missing"}`}
              >
                <span className="action-panel__craft-ing-mark">{ing.enough ? "✔" : "✖"}</span>
                {ing.itemImage && (
                  <img className="action-panel__craft-ing-img" src={ing.itemImage} alt="" aria-hidden="true" />
                )}
                <span className="action-panel__craft-ing-count">
                  {ing.owned} / {ing.required}
                </span>
                <span className="action-panel__craft-ing-name">{ing.itemName}</span>
              </span>
            ))}
          </div>

          <div className="action-panel__craft-qty">
            <span className="action-panel__craft-section-label">Quantité</span>
            <div className="action-panel__craft-qty-controls">
              <button
                type="button"
                className="action-panel__craft-qty-btn"
                onClick={() => setQuantity((q) => clampQuantity(q - 1))}
                disabled={quantity <= 1}
                aria-label="Diminuer la quantité"
              >
                −
              </button>
              <input
                className="action-panel__craft-qty-input"
                type="number"
                min={1}
                max={CRAFT_MAX_QUANTITY}
                value={quantity}
                onChange={(e) => setQuantity(clampQuantity(Number(e.target.value)))}
                aria-label="Quantité à fabriquer"
              />
              <button
                type="button"
                className="action-panel__craft-qty-btn"
                onClick={() => setQuantity((q) => clampQuantity(q + 1))}
                disabled={quantity >= CRAFT_MAX_QUANTITY}
                aria-label="Augmenter la quantité"
              >
                +
              </button>
            </div>
            <span className="action-panel__craft-maxinfo">Maximum craftable : {maxCraftable}</span>
          </div>

          <button
            className="action-panel__button action-panel__craft-submit"
            disabled={!canCraft}
            onClick={() => craft(selectedRecipe)}
          >
            {isCrafting ? "Fabrication…" : "Fabriquer"}
          </button>
        </div>
      )}

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
          {result.characterXp && (
            <span>
              XP perso: +{result.characterXp.xpGained}
              {result.characterXp.leveledUp ? " · niveau supérieur !" : ""}
            </span>
          )}
          {result.skill && (
            <span>
              XP skill: +{result.skill.xpGained} {result.skill.key}
              {result.skill.newLevel > result.skill.previousLevel ? " · niveau supérieur !" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function isCraftingServerError(value: unknown): value is CraftingServerError {
  return Boolean(value && typeof value === "object" && typeof (value as CraftingServerError).message === "string");
}
