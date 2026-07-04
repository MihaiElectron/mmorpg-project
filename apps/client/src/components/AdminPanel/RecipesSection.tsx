import { useState } from "react";
import { StatField, kbHandlers, ackPromise, getSocket, type FieldDef } from "./adminPanel.shared";
import { estimateCraftSkillXp } from "../ActionPanel/craftingRuntime";
import { ItemCatalog, ItemIcon } from "../DevTools/shared/ItemCatalog";
import {
  replaceRecipeIngredients,
  replaceRecipeResults,
} from "../DevTools/modules/Recipes/recipeEditorApi";
import {
  validateRecipeIngredients,
  validateRecipeResults,
  craftTimeMsToSeconds,
  craftTimeSecondsToMs,
  isValidCraftTimeMs,
  MIN_CRAFT_TIME_SECONDS,
  MIN_CRAFT_TIME_MS,
  MIN_CRAFT_TIME_MESSAGE,
} from "../DevTools/modules/Recipes/recipeEditorHelpers";
import type { ItemCatalogEntry } from "../DevTools/modules/Items/itemEditor.types";

// ── Types locaux ─────────────────────────────────────────────────────────────

type Ingredient = { id: string; itemId: string; requiredQuantity: number };
type RecipeResult = { id: string; itemId: string; producedQuantity: number; chance: number };
type Recipe = {
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
  craftCharacterXpReward: number;
  craftingDifficulty: number;
  consumeIngredientsOnFailure: boolean;
  craftTimeMs: number;
  stationType: string;
  enabled: boolean;
  ingredients: Ingredient[];
  results: RecipeResult[];
};

type ItemOption = ItemCatalogEntry;
type SkillDef   = { key: string; name: string };

type Props = {
  recipes: Recipe[];
  skillDefinitions: SkillDef[];
  items: ItemOption[];
  onResult: (msg: string, ok: boolean) => void;
  onRecipeCreated: (r: Recipe) => void;
  onRecipeUpdated: (r: Recipe) => void;
  onIngredientAdded: (recipeId: string, ing: Ingredient) => void;
  onIngredientRemoved: (recipeId: string, ingId: string) => void;
  onResultAdded: (recipeId: string, res: RecipeResult) => void;
  onResultRemoved: (recipeId: string, resId: string) => void;
};

// ── Constantes ────────────────────────────────────────────────────────────────
// TODO: ces listes deviendront data-driven via API quand les entités correspondantes existeront.

const RECIPE_CATEGORIES = ["smithing", "woodworking", "cooking", "alchemy", "tailoring", "jewelry", "general"] as const;

const STATION_TYPES = ["none", "forge", "workbench", "sawmill", "cooking_station", "alchemy_table", "tailoring_station", "jewelry_table"] as const;

const RECIPE_FIELDS: FieldDef[] = [
  { key: "name",                       label: "Nom",                  type: "text" },
  { key: "category",                   label: "Catégorie",            options: [...RECIPE_CATEGORIES] },
  { key: "requiredSkillKey",           label: "Skill requis",         options: [] },
  { key: "requiredSkillLevel",         label: "Niveau skill requis",  min: 1 },
  { key: "baseSuccessRate",            label: "Taux base",            min: 0, step: 0.05 },
  { key: "successBonusPerLevel",       label: "Bonus/niv",            min: 0, step: 0.01 },
  { key: "minSuccessRate",             label: "Taux min",             min: 0, step: 0.05 },
  { key: "maxSuccessRate",             label: "Taux max",             min: 0, step: 0.05 },
  { key: "xpReward",                   label: "XP (legacy)",          min: 0 },
  { key: "craftCharacterXpReward",     label: "XP perso craft",       min: 0 },
  { key: "craftingDifficulty",         label: "Difficulté craft",     min: 0, max: 100 },
  // craftTimeMs est rendu séparément en secondes (voir Durée (s)).
  { key: "stationType",                label: "Station requise",      options: [...STATION_TYPES] },
  { key: "enabled",                    label: "Actif",                options: ["true", "false"] },
  { key: "consumeIngredientsOnFailure", label: "Consomme si échec",   options: ["true", "false"] },
];

const NEW_RECIPE_DEFAULT = { key: "", name: "", category: "general", requiredSkillKey: "", requiredSkillLevel: 1, baseSuccessRate: 1.0, successBonusPerLevel: 0.02, minSuccessRate: 0.05, maxSuccessRate: 1.0, xpReward: 10, craftCharacterXpReward: 0, craftingDifficulty: 0, consumeIngredientsOnFailure: true, craftTimeMs: MIN_CRAFT_TIME_MS, stationType: "" };
const NEW_ING_DEFAULT = { itemId: "", requiredQuantity: 1 };
const NEW_RES_DEFAULT = { itemId: "", producedQuantity: 1, chance: 1.0 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function fieldValue(recipe: Recipe, key: string): string {
  const v = (recipe as any)[key];
  if (typeof v === "boolean") return String(v);
  return String(v ?? "");
}

// ── RecipesSection ────────────────────────────────────────────────────────────

export default function RecipesSection({ recipes, skillDefinitions, items, onResult, onRecipeCreated, onRecipeUpdated, onIngredientAdded, onIngredientRemoved, onResultAdded, onResultRemoved }: Props) {
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [createRecipeOpen, setCreateRecipeOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [newRecipe, setNewRecipe] = useState({ ...NEW_RECIPE_DEFAULT });
  const [creating, setCreating] = useState(false);
  const [ingredientDrafts, setIngredientDrafts] = useState<Record<string, Ingredient[]>>({});
  const [resultDrafts, setResultDrafts] = useState<Record<string, RecipeResult[]>>({});
  const [ingredientQueries, setIngredientQueries] = useState<Record<string, string>>({});
  const [resultQueries, setResultQueries] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const skillKeyOptions = ["", ...skillDefinitions.map((sd) => sd.key)];
  const skillKeyLabels  = ["—", ...skillDefinitions.map((sd) => `${sd.name} (${sd.key})`)];
  const skillNameByKey  = Object.fromEntries(skillDefinitions.map((sd) => [sd.key, sd.name]));

  function setDraftField(recipeId: string, field: string, value: string) {
    setDrafts((prev) => ({ ...prev, [recipeId]: { ...(prev[recipeId] ?? {}), [field]: value } }));
  }

  function isDirty(recipeId: string, field: string, recipe: Recipe): boolean {
    const draft = drafts[recipeId]?.[field];
    if (draft === undefined || draft === "") return false;
    const def = RECIPE_FIELDS.find((f) => f.key === field);
    if (def?.options || def?.type === "text") return draft !== fieldValue(recipe, field);
    return Number(draft) !== Number(fieldValue(recipe, field));
  }

  function collectDirty(recipeId: string, recipe: Recipe): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const f of RECIPE_FIELDS) {
      if (!isDirty(recipeId, f.key, recipe)) continue;
      const raw = drafts[recipeId]?.[f.key] ?? "";
      if (f.options || f.type === "text") {
        result[f.key] = raw;
      } else {
        const n = Number(raw);
        if (!isNaN(n)) result[f.key] = n;
      }
    }
    return result;
  }

  async function saveRecipe(recipe: Recipe) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const dirty = collectDirty(recipe.id, recipe);
    if (Object.keys(dirty).length === 0) return;
    const effectiveCraftTimeMs = (dirty.craftTimeMs as number | undefined) ?? recipe.craftTimeMs;
    if (!isValidCraftTimeMs(effectiveCraftTimeMs)) { onResult(MIN_CRAFT_TIME_MESSAGE, false); return; }
    const r = await ackPromise(socket, "admin:update_crafting_recipe", { id: recipe.id, fields: dirty });
    onResult(r.message, r.success);
    if (r.success && r.data) {
      onRecipeUpdated(r.data as Recipe);
      setDrafts((prev) => { const next = { ...prev }; delete next[recipe.id]; return next; });
    }
  }

  function ingredientDraft(recipe: Recipe): Ingredient[] {
    return ingredientDrafts[recipe.id] ?? recipe.ingredients;
  }

  function resultDraft(recipe: Recipe): RecipeResult[] {
    return resultDrafts[recipe.id] ?? recipe.results;
  }

  function addIngredientDraft(recipe: Recipe, item: ItemOption) {
    const draft = ingredientDraft(recipe);
    if (draft.some((ing) => ing.itemId === item.id)) return;
    setIngredientDrafts((prev) => ({
      ...prev,
      [recipe.id]: [...draft, { id: `draft-${item.id}`, itemId: item.id, requiredQuantity: 1 }],
    }));
  }

  function updateIngredientDraft(recipe: Recipe, index: number, requiredQuantity: number) {
    setIngredientDrafts((prev) => ({
      ...prev,
      [recipe.id]: ingredientDraft(recipe).map((ing, idx) =>
        idx === index ? { ...ing, requiredQuantity } : ing,
      ),
    }));
  }

  function removeIngredientDraft(recipe: Recipe, index: number) {
    setIngredientDrafts((prev) => ({
      ...prev,
      [recipe.id]: ingredientDraft(recipe).filter((_, idx) => idx !== index),
    }));
  }

  function addResultDraft(recipe: Recipe, item: ItemOption) {
    const draft = resultDraft(recipe);
    if (draft.some((res) => res.itemId === item.id)) return;
    setResultDrafts((prev) => ({
      ...prev,
      [recipe.id]: [...draft, { id: `draft-${item.id}`, itemId: item.id, producedQuantity: 1, chance: 1 }],
    }));
  }

  function updateResultDraft(recipe: Recipe, index: number, patch: Partial<RecipeResult>) {
    setResultDrafts((prev) => ({
      ...prev,
      [recipe.id]: resultDraft(recipe).map((res, idx) =>
        idx === index ? { ...res, ...patch } : res,
      ),
    }));
  }

  function removeResultDraft(recipe: Recipe, index: number) {
    setResultDrafts((prev) => ({
      ...prev,
      [recipe.id]: resultDraft(recipe).filter((_, idx) => idx !== index),
    }));
  }

  async function saveIngredientDraft(recipe: Recipe) {
    const draft = ingredientDraft(recipe);
    const validation = validateRecipeIngredients(draft, items);
    if (!validation.valid) {
      onResult(validation.errors.join(" · "), false);
      return;
    }
    setPending((p) => ({ ...p, [`ing-save-${recipe.id}`]: true }));
    try {
      const updated = await replaceRecipeIngredients(recipe.id, draft);
      onRecipeUpdated(updated as Recipe);
      setIngredientDrafts((prev) => {
        const next = { ...prev };
        delete next[recipe.id];
        return next;
      });
      onResult("Ingrédients sauvegardés.", true);
    } catch (err) {
      onResult(err instanceof Error ? err.message : "Erreur ingrédients.", false);
    } finally {
      setPending((p) => ({ ...p, [`ing-save-${recipe.id}`]: false }));
    }
  }

  async function saveResultDraft(recipe: Recipe) {
    const draft = resultDraft(recipe);
    const validation = validateRecipeResults(draft, items);
    if (!validation.valid) {
      onResult(validation.errors.join(" · "), false);
      return;
    }
    setPending((p) => ({ ...p, [`res-save-${recipe.id}`]: true }));
    try {
      const updated = await replaceRecipeResults(recipe.id, draft);
      onRecipeUpdated(updated as Recipe);
      setResultDrafts((prev) => {
        const next = { ...prev };
        delete next[recipe.id];
        return next;
      });
      onResult("Résultats sauvegardés.", true);
    } catch (err) {
      onResult(err instanceof Error ? err.message : "Erreur résultats.", false);
    } finally {
      setPending((p) => ({ ...p, [`res-save-${recipe.id}`]: false }));
    }
  }

  async function createRecipe() {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    if (!newRecipe.stationType) { onResult("Station requise : choisir une station.", false); return; }
    if (!isValidCraftTimeMs(newRecipe.craftTimeMs)) { onResult(MIN_CRAFT_TIME_MESSAGE, false); return; }
    setCreating(true);
    const r = await ackPromise(socket, "admin:create_crafting_recipe", { fields: newRecipe });
    setCreating(false);
    onResult(r.message, r.success);
    if (r.success && r.data) {
      onRecipeCreated({ ...(r.data as Recipe), ingredients: [], results: [] });
      setNewRecipe({ ...NEW_RECIPE_DEFAULT });
    }
  }

  const recipeList = (
    <>
      <div className="admin-panel__embedded-toolbar">
        <span className="admin-panel__count-badge">{recipes.length}</span>
      </div>
      <div className="admin-panel__template-list">
        {recipes.map((recipe) => {
          const expanded = expandedId === recipe.id;
          const ingredients = ingredientDraft(recipe);
          const results = resultDraft(recipe);
          const ingredientValidation = validateRecipeIngredients(ingredients, items);
          const resultValidation = validateRecipeResults(results, items);
          const ingredientItemIds = new Set(ingredients.map((ing) => ing.itemId));
          const resultItemIds = new Set(results.map((res) => res.itemId));
          const recipeDirty = Object.keys(collectDirty(recipe.id, recipe)).length > 0;
          const ingredientsDirty =
            JSON.stringify(ingredients.map((i) => ({ itemId: i.itemId, requiredQuantity: i.requiredQuantity }))) !==
            JSON.stringify(recipe.ingredients.map((i) => ({ itemId: i.itemId, requiredQuantity: i.requiredQuantity })));
          const resultsDirty =
            JSON.stringify(results.map((r) => ({ itemId: r.itemId, producedQuantity: r.producedQuantity, chance: r.chance }))) !==
            JSON.stringify(recipe.results.map((r) => ({ itemId: r.itemId, producedQuantity: r.producedQuantity, chance: r.chance })));
          // Image de la recette = image de l'item output (source de vérité, éditée dans Item Editor).
          const outputRef = results[0]?.itemId;
          const outputItem = outputRef
            ? items.find((it: any) => it.id === outputRef || it.category === outputRef)
            : null;
          const outputImage = (outputItem as any)?.image ?? null;

          return (
            <div key={recipe.id} className="admin-panel__template-group">
              <div className="admin-panel__template-header" onClick={() => setExpandedId(expanded ? null : recipe.id)}>
                <div className="admin-panel__recipe-header-main">
                  <span className="admin-panel__section-chevron">{expanded ? "▼" : "▶"}</span>
                  {outputImage && (
                    <img className="admin-panel__recipe-output-img" src={outputImage} alt="" aria-hidden="true" />
                  )}
                  <span className="admin-panel__template-name">{recipe.name}</span>
                  <span className={`admin-panel__badge admin-panel__badge--${recipe.enabled ? "alive" : "dead"}`}>
                    {recipe.enabled ? "actif" : "désactivé"}
                  </span>
                </div>
                <div className="admin-panel__recipe-subtext">
                  <span className="admin-panel__recipe-key">{recipe.key}</span>
                  {recipe.category && (
                    <><span className="admin-panel__recipe-sep"> · </span>
                    <span className="admin-panel__recipe-cat">{recipe.category}</span></>
                  )}
                  {recipe.requiredSkillKey && (
                    <><span className="admin-panel__recipe-sep"> · </span>
                    <span className="admin-panel__recipe-skill">
                      skill: {skillNameByKey[recipe.requiredSkillKey] ?? recipe.requiredSkillKey}
                    </span></>
                  )}
                </div>
              </div>

              {expanded && (
                <div className="admin-panel__template-item">
                  <div className="admin-panel__template-stats">
                    {RECIPE_FIELDS.map((def) => {
                      const fieldDef: FieldDef = def.key === "requiredSkillKey"
                        ? { ...def, options: skillKeyOptions, optionLabels: skillKeyLabels }
                        : def;
                      return (
                        <label key={def.key} className="admin-panel__template-stat">
                          <span className="admin-panel__template-stat-label">{def.label}</span>
                          <StatField
                            def={fieldDef}
                            dirty={isDirty(recipe.id, def.key, recipe)}
                            value={drafts[recipe.id]?.[def.key] ?? fieldValue(recipe, def.key)}
                            onChange={(v) => setDraftField(recipe.id, def.key, v)}
                          />
                        </label>
                      );
                    })}
                    <label className="admin-panel__template-stat">
                      <span className="admin-panel__template-stat-label">Durée (s)</span>
                      <input
                        className="admin-panel__template-stat-input"
                        type="number"
                        min={MIN_CRAFT_TIME_SECONDS}
                        step={0.1}
                        value={craftTimeMsToSeconds(drafts[recipe.id]?.craftTimeMs ?? recipe.craftTimeMs)}
                        onChange={(e) => setDraftField(recipe.id, "craftTimeMs", String(craftTimeSecondsToMs(e.target.value)))}
                        {...kbHandlers}
                      />
                    </label>
                  </div>
                  {!isValidCraftTimeMs(drafts[recipe.id]?.craftTimeMs ?? recipe.craftTimeMs) && (
                    <p className="admin-panel__recipe-validation">{MIN_CRAFT_TIME_MESSAGE}</p>
                  )}
                  <p className="admin-panel__field-hint">
                    Une recette crée toujours un CraftJob : le joueur réclamera son résultat une fois la fabrication terminée.
                    {" "}XP skill estimée : +{estimateCraftSkillXp(Number(drafts[recipe.id]?.craftingDifficulty ?? recipe.craftingDifficulty))} {recipe.requiredSkillKey || "—"} / craft réussi (Runtime, lecture seule).
                  </p>
                  {recipeDirty && (
                    <div className="admin-panel__template-actions">
                      <button
                        className="admin-panel__apply-btn"
                        disabled={!isValidCraftTimeMs(drafts[recipe.id]?.craftTimeMs ?? recipe.craftTimeMs)}
                        onClick={() => saveRecipe(recipe)}
                      >
                        Save
                      </button>
                    </div>
                  )}

                  <div className="admin-panel__info-line">
                    <strong>Ingrédients ({ingredients.length})</strong>
                  </div>
                  <div className="admin-panel__recipe-lines">
                  {ingredients.map((ing, index) => {
                    const item = items.find((i) => i.id === ing.itemId);
                    return (
                      <div key={ing.id ?? ing.itemId} className="admin-panel__recipe-line">
                        <ItemIcon item={item ?? null} />
                        <span className="admin-panel__recipe-line-copy">
                          <span className="admin-panel__recipe-line-name">
                            {item ? item.name : ing.itemId}
                          </span>
                          <span className="admin-panel__recipe-line-meta">
                            {item ? `${item.type} / ${item.category}` : "Item inconnu"}
                          </span>
                        </span>
                        <label className="admin-panel__recipe-line-field">
                          <span>Qté</span>
                          <input className="admin-panel__template-stat-input" type="number" min={1}
                            value={ing.requiredQuantity}
                            onChange={(e) => updateIngredientDraft(recipe, index, Number(e.target.value))}
                            {...kbHandlers} />
                        </label>
                        <button className="admin-panel__delete-btn" onClick={() => removeIngredientDraft(recipe, index)}>✕</button>
                      </div>
                    );
                  })}
                  </div>
                  {!ingredientValidation.valid && (
                    <p className="admin-panel__recipe-validation">
                      {ingredientValidation.errors.join(" · ")}
                    </p>
                  )}
                  <ItemCatalog
                    items={items}
                    query={ingredientQueries[recipe.id] ?? ""}
                    onQueryChange={(query) => setIngredientQueries((prev) => ({ ...prev, [recipe.id]: query }))}
                    onAdd={(item) => addIngredientDraft(recipe, item)}
                    disabledItemIds={ingredientItemIds}
                    addLabel="+ Ing."
                    searchInputHandlers={kbHandlers}
                  />
                  {ingredientsDirty && (
                    <div className="admin-panel__template-actions">
                      <button
                        className="admin-panel__apply-btn"
                        disabled={!ingredientValidation.valid || pending[`ing-save-${recipe.id}`]}
                        onClick={() => saveIngredientDraft(recipe)}
                      >
                        {pending[`ing-save-${recipe.id}`] ? "…" : "Save"}
                      </button>
                    </div>
                  )}

                  <div className="admin-panel__info-line">
                    <strong>Résultats ({results.length})</strong>
                    <span className="admin-panel__field-hint">
                      {" "}— l'image affichée en jeu et en inventaire vient de l'item output (éditable dans Item Editor).
                    </span>
                  </div>
                  <div className="admin-panel__recipe-lines">
                  {results.map((res, index) => {
                    const item = items.find((i) => i.id === res.itemId);
                    return (
                      <div key={res.id ?? res.itemId} className="admin-panel__recipe-line admin-panel__recipe-line--result">
                        <ItemIcon item={item ?? null} />
                        <span className="admin-panel__recipe-line-copy">
                          <span className="admin-panel__recipe-line-name">
                            {item ? item.name : res.itemId}
                          </span>
                          <span className="admin-panel__recipe-line-meta">
                            {item ? `${item.type} / ${item.category}` : "Item inconnu"}
                          </span>
                        </span>
                        <label className="admin-panel__recipe-line-field">
                          <span>Qté</span>
                          <input className="admin-panel__template-stat-input" type="number" min={1}
                            value={res.producedQuantity}
                            onChange={(e) => updateResultDraft(recipe, index, { producedQuantity: Number(e.target.value) })}
                            {...kbHandlers} />
                        </label>
                        <label className="admin-panel__recipe-line-field">
                          <span>Chance</span>
                          <input className="admin-panel__template-stat-input" type="number" min={0} max={1} step={0.05}
                            value={res.chance}
                            onChange={(e) => updateResultDraft(recipe, index, { chance: Number(e.target.value) })}
                            {...kbHandlers} />
                        </label>
                        <button className="admin-panel__delete-btn" onClick={() => removeResultDraft(recipe, index)}>✕</button>
                      </div>
                    );
                  })}
                  </div>
                  {!resultValidation.valid && (
                    <p className="admin-panel__recipe-validation">
                      {resultValidation.errors.join(" · ")}
                    </p>
                  )}
                  <ItemCatalog
                    items={items}
                    query={resultQueries[recipe.id] ?? ""}
                    onQueryChange={(query) => setResultQueries((prev) => ({ ...prev, [recipe.id]: query }))}
                    onAdd={(item) => addResultDraft(recipe, item)}
                    disabledItemIds={resultItemIds}
                    addLabel="+ Rés."
                    searchInputHandlers={kbHandlers}
                  />
                  {resultsDirty && (
                    <div className="admin-panel__template-actions">
                      <button
                        className="admin-panel__apply-btn"
                        disabled={!resultValidation.valid || pending[`res-save-${recipe.id}`]}
                        onClick={() => saveResultDraft(recipe)}
                      >
                        {pending[`res-save-${recipe.id}`] ? "…" : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );

  const createRecipeForm = (
    <div className="admin-panel__template-item admin-panel__template-item--create">
      <div className="admin-panel__template-stats admin-panel__template-stats--create">
        {(["key", "name"] as const).map((f) => (
          <label key={f} className="admin-panel__template-stat">
            <span className="admin-panel__template-stat-label">{f === "key" ? "Key" : "Nom"}</span>
            <input className="admin-panel__template-stat-input" type="text"
              value={(newRecipe as any)[f]}
              onChange={(e) => setNewRecipe((prev) => ({ ...prev, [f]: e.target.value }))}
              {...kbHandlers} />
          </label>
        ))}
        <label className="admin-panel__template-stat">
          <span className="admin-panel__template-stat-label">Catégorie</span>
          <select className="admin-panel__template-stat-input"
            value={newRecipe.category}
            onChange={(e) => setNewRecipe((prev) => ({ ...prev, category: e.target.value }))}
            {...kbHandlers}>
            {RECIPE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="admin-panel__template-stat">
          <span className="admin-panel__template-stat-label">Station requise</span>
          <select className="admin-panel__template-stat-input"
            value={newRecipe.stationType}
            onChange={(e) => setNewRecipe((prev) => ({ ...prev, stationType: e.target.value }))}
            {...kbHandlers}>
            <option value="" disabled>— choisir une station —</option>
            {STATION_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="admin-panel__template-stat">
          <span className="admin-panel__template-stat-label">Skill requis</span>
          <select className="admin-panel__template-stat-input"
            value={newRecipe.requiredSkillKey}
            onChange={(e) => setNewRecipe((prev) => ({ ...prev, requiredSkillKey: e.target.value }))}
            {...kbHandlers}>
            {skillKeyOptions.map((k, i) => (
              <option key={k} value={k}>{skillKeyLabels[i]}</option>
            ))}
          </select>
        </label>
        {([
          { f: "requiredSkillLevel",   label: "Niv. requis",  step: 1 },
          { f: "baseSuccessRate",      label: "Taux base",    step: 0.05 },
          { f: "minSuccessRate",       label: "Taux min",     step: 0.05 },
          { f: "maxSuccessRate",       label: "Taux max",     step: 0.05 },
          { f: "xpReward",             label: "XP (legacy)",  step: 1 },
          { f: "craftCharacterXpReward", label: "XP perso craft", step: 1 },
          { f: "craftingDifficulty",   label: "Difficulté craft (0–100)", step: 1 },
        ] as const).map(({ f, label, step }) => (
          <label key={f} className="admin-panel__template-stat">
            <span className="admin-panel__template-stat-label">{label}</span>
            <input className="admin-panel__template-stat-input" type="number" min={0} step={step}
              value={(newRecipe as any)[f]}
              onChange={(e) => setNewRecipe((prev) => ({ ...prev, [f]: Number(e.target.value) }))}
              {...kbHandlers} />
          </label>
        ))}
        <label className="admin-panel__template-stat">
          <span className="admin-panel__template-stat-label">Durée (s)</span>
          <input className="admin-panel__template-stat-input" type="number" min={MIN_CRAFT_TIME_SECONDS} step={0.1}
            value={craftTimeMsToSeconds(newRecipe.craftTimeMs)}
            onChange={(e) => setNewRecipe((prev) => ({ ...prev, craftTimeMs: craftTimeSecondsToMs(e.target.value) }))}
            {...kbHandlers} />
        </label>
      </div>
      {!isValidCraftTimeMs(newRecipe.craftTimeMs) && (
        <p className="admin-panel__recipe-validation">{MIN_CRAFT_TIME_MESSAGE}</p>
      )}
      <p className="admin-panel__field-hint">
        Station requise = où cette recette peut être fabriquée (forge, workbench…).
        Skill requis = compétence et niveau du personnage nécessaires.
        Toute recette crée un CraftJob (durée minimale {MIN_CRAFT_TIME_SECONDS} s) : le joueur réclame son résultat une fois terminé.
      </p>
      <button
        className="admin-panel__apply-btn"
        disabled={creating || !newRecipe.stationType || !isValidCraftTimeMs(newRecipe.craftTimeMs)}
        onClick={createRecipe}
      >
        {creating ? "…" : "Créer"}
      </button>
    </div>
  );

  return (
    <section className="admin-panel__section">
      <div className="admin-panel__dual-header">
        <div className="admin-panel__section-toggle" onClick={() => setRecipesOpen((o) => !o)}>
          <span className="admin-panel__section-chevron">{recipesOpen ? "▼" : "▶"}</span>
          Recipe Editor
        </div>
        <span className="admin-panel__count">
          {recipes.length} recette{recipes.length > 1 ? "s" : ""}
        </span>
      </div>
      {recipesOpen && (
        <div className="admin-panel__create-head">
          <button type="button" className="admin-panel__create-toggle" onClick={() => setCreateRecipeOpen((o) => !o)}>
            <span className="admin-panel__section-chevron">{createRecipeOpen ? "▼" : "▶"}</span>
            Créer recette
          </button>
        </div>
      )}
      {recipesOpen && createRecipeOpen && createRecipeForm}
      {recipesOpen && recipeList}
    </section>
  );
}
