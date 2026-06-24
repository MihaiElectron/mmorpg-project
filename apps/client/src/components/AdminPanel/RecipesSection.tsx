import { useState } from "react";
import { StatField, kbHandlers, ackPromise, getSocket, type FieldDef } from "./adminPanel.shared";

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
  consumeIngredientsOnFailure: boolean;
  craftTimeMs: number;
  stationType: string;
  enabled: boolean;
  ingredients: Ingredient[];
  results: RecipeResult[];
};

type ItemOption = { id: string; name: string; category: string };
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
  { key: "requiredSkillLevel",         label: "Niv. requis",          min: 1 },
  { key: "baseSuccessRate",            label: "Taux base",            min: 0, step: 0.05 },
  { key: "successBonusPerLevel",       label: "Bonus/niv",            min: 0, step: 0.01 },
  { key: "minSuccessRate",             label: "Taux min",             min: 0, step: 0.05 },
  { key: "maxSuccessRate",             label: "Taux max",             min: 0, step: 0.05 },
  { key: "xpReward",                   label: "XP",                   min: 0 },
  { key: "craftTimeMs",                label: "Durée (ms)",           min: 0, step: 100 },
  { key: "stationType",                label: "Station",              options: [...STATION_TYPES] },
  { key: "enabled",                    label: "Actif",                options: ["true", "false"] },
  { key: "consumeIngredientsOnFailure", label: "Consomme si échec",   options: ["true", "false"] },
];

const NEW_RECIPE_DEFAULT = { key: "", name: "", category: "general", requiredSkillKey: "", requiredSkillLevel: 1, baseSuccessRate: 1.0, successBonusPerLevel: 0.02, minSuccessRate: 0.05, maxSuccessRate: 1.0, xpReward: 10, consumeIngredientsOnFailure: true, craftTimeMs: 0, stationType: "none" };
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newRecipe, setNewRecipe] = useState({ ...NEW_RECIPE_DEFAULT });
  const [creating, setCreating] = useState(false);
  const [newIng, setNewIng] = useState<Record<string, typeof NEW_ING_DEFAULT>>({});
  const [newRes, setNewRes] = useState<Record<string, typeof NEW_RES_DEFAULT>>({});
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
    const r = await ackPromise(socket, "admin:update_crafting_recipe", { id: recipe.id, fields: dirty });
    onResult(r.message, r.success);
    if (r.success && r.data) {
      onRecipeUpdated(r.data as Recipe);
      setDrafts((prev) => { const next = { ...prev }; delete next[recipe.id]; return next; });
    }
  }

  async function addIngredient(recipeId: string) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const { itemId, requiredQuantity } = newIng[recipeId] ?? NEW_ING_DEFAULT;
    if (!itemId) { onResult("Sélectionner un item.", false); return; }
    setPending((p) => ({ ...p, [`ing-${recipeId}`]: true }));
    const r = await ackPromise(socket, "admin:add_ingredient", { recipeId, itemId, requiredQuantity });
    setPending((p) => ({ ...p, [`ing-${recipeId}`]: false }));
    onResult(r.message, r.success);
    if (r.success && r.data) {
      onIngredientAdded(recipeId, r.data as Ingredient);
      setNewIng((prev) => ({ ...prev, [recipeId]: { ...NEW_ING_DEFAULT } }));
    }
  }

  async function removeIngredient(recipeId: string, ingId: string) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const r = await ackPromise(socket, "admin:remove_ingredient", { ingredientId: ingId });
    onResult(r.message, r.success);
    if (r.success) onIngredientRemoved(recipeId, ingId);
  }

  async function addResult(recipeId: string) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const { itemId, producedQuantity, chance } = newRes[recipeId] ?? NEW_RES_DEFAULT;
    if (!itemId) { onResult("Sélectionner un item.", false); return; }
    setPending((p) => ({ ...p, [`res-${recipeId}`]: true }));
    const r = await ackPromise(socket, "admin:add_result", { recipeId, itemId, producedQuantity, chance });
    setPending((p) => ({ ...p, [`res-${recipeId}`]: false }));
    onResult(r.message, r.success);
    if (r.success && r.data) {
      onResultAdded(recipeId, r.data as RecipeResult);
      setNewRes((prev) => ({ ...prev, [recipeId]: { ...NEW_RES_DEFAULT } }));
    }
  }

  async function removeResult(recipeId: string, resId: string) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const r = await ackPromise(socket, "admin:remove_result", { resultId: resId });
    onResult(r.message, r.success);
    if (r.success) onResultRemoved(recipeId, resId);
  }

  async function validateRecipe(recipeId: string) {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    const r = await ackPromise(socket, "admin:validate_crafting_recipe", { recipeId });
    onResult(r.message, r.success);
  }

  async function createRecipe() {
    const socket = getSocket();
    if (!socket?.connected) { onResult("Socket non connecté.", false); return; }
    setCreating(true);
    const r = await ackPromise(socket, "admin:create_crafting_recipe", { fields: newRecipe });
    setCreating(false);
    onResult(r.message, r.success);
    if (r.success && r.data) {
      onRecipeCreated({ ...(r.data as Recipe), ingredients: [], results: [] });
      setNewRecipe({ ...NEW_RECIPE_DEFAULT });
      setCreateOpen(false);
    }
  }

  return (
    <section className="admin-panel__section">
      <div className="admin-panel__section-header">
        <span className="admin-panel__section-title">Recettes de crafting</span>
        <span className="admin-panel__count-badge">{recipes.length}</span>
      </div>

      {/* ── Formulaire de création ── */}
      <div className="admin-panel__section-header" onClick={() => setCreateOpen((o) => !o)}>
        <span className="admin-panel__section-toggle">
          <span className="admin-panel__section-chevron">{createOpen ? "▼" : "▶"}</span>
          Créer une recette
        </span>
      </div>
      {createOpen && (
        <div className="admin-panel__template-item">
          <div className="admin-panel__template-stats">
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
              <span className="admin-panel__template-stat-label">Station</span>
              <select className="admin-panel__template-stat-input"
                value={newRecipe.stationType}
                onChange={(e) => setNewRecipe((prev) => ({ ...prev, stationType: e.target.value }))}
                {...kbHandlers}>
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
              { f: "xpReward",             label: "XP",           step: 1 },
              { f: "craftTimeMs",          label: "Durée (ms)",   step: 100 },
            ] as const).map(({ f, label, step }) => (
              <label key={f} className="admin-panel__template-stat">
                <span className="admin-panel__template-stat-label">{label}</span>
                <input className="admin-panel__template-stat-input" type="number" min={0} step={step}
                  value={(newRecipe as any)[f]}
                  onChange={(e) => setNewRecipe((prev) => ({ ...prev, [f]: Number(e.target.value) }))}
                  {...kbHandlers} />
              </label>
            ))}
          </div>
          <button className="admin-panel__apply-btn" disabled={creating} onClick={createRecipe}>
            {creating ? "…" : "Créer"}
          </button>
        </div>
      )}

      {/* ── Liste des recettes ── */}
      {recipes.map((recipe) => {
        const expanded = expandedId === recipe.id;
        const ingNew = newIng[recipe.id] ?? NEW_ING_DEFAULT;
        const resNew = newRes[recipe.id] ?? NEW_RES_DEFAULT;

        return (
          <div key={recipe.id} className="admin-panel__template-group">
            <div className="admin-panel__template-header" onClick={() => setExpandedId(expanded ? null : recipe.id)}>
              <div className="admin-panel__recipe-header-main">
                <span className="admin-panel__section-chevron">{expanded ? "▼" : "▶"}</span>
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
                {/* Champs éditables recette */}
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
                </div>
                <div className="admin-panel__template-actions">
                  <button className="admin-panel__apply-btn" onClick={() => saveRecipe(recipe)}>Sauvegarder</button>
                  <button className="admin-panel__apply-btn" onClick={() => validateRecipe(recipe.id)}>Valider</button>
                </div>

                {/* Ingrédients */}
                <div className="admin-panel__info-line">
                  <strong>Ingrédients ({recipe.ingredients.length})</strong>
                </div>
                {recipe.ingredients.map((ing) => {
                  const item = items.find((i) => i.id === ing.itemId);
                  return (
                    <div key={ing.id} className="admin-panel__instance-row">
                      <span className="admin-panel__instance-name">{item ? `${item.name} (${item.category})` : ing.itemId}</span>
                      <span className="admin-panel__instance-badge">×{ing.requiredQuantity}</span>
                      <button className="admin-panel__delete-btn" onClick={() => removeIngredient(recipe.id, ing.id)}>✕</button>
                    </div>
                  );
                })}
                <div className="admin-panel__template-stats">
                  <label className="admin-panel__template-stat">
                    <span className="admin-panel__template-stat-label">Item</span>
                    <select className="admin-panel__template-stat-input"
                      value={ingNew.itemId}
                      onChange={(e) => setNewIng((prev) => ({ ...prev, [recipe.id]: { ...(prev[recipe.id] ?? NEW_ING_DEFAULT), itemId: e.target.value } }))}
                      {...kbHandlers}>
                      <option value="">—</option>
                      {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.category})</option>)}
                    </select>
                  </label>
                  <label className="admin-panel__template-stat">
                    <span className="admin-panel__template-stat-label">Qté</span>
                    <input className="admin-panel__template-stat-input" type="number" min={1}
                      value={ingNew.requiredQuantity}
                      onChange={(e) => setNewIng((prev) => ({ ...prev, [recipe.id]: { ...(prev[recipe.id] ?? NEW_ING_DEFAULT), requiredQuantity: Number(e.target.value) } }))}
                      {...kbHandlers} />
                  </label>
                  <button className="admin-panel__apply-btn" disabled={pending[`ing-${recipe.id}`]} onClick={() => addIngredient(recipe.id)}>
                    {pending[`ing-${recipe.id}`] ? "…" : "+ Ingrédient"}
                  </button>
                </div>

                {/* Résultats */}
                <div className="admin-panel__info-line">
                  <strong>Résultats ({recipe.results.length})</strong>
                </div>
                {recipe.results.map((res) => {
                  const item = items.find((i) => i.id === res.itemId);
                  return (
                    <div key={res.id} className="admin-panel__instance-row">
                      <span className="admin-panel__instance-name">{item ? `${item.name} (${item.category})` : res.itemId}</span>
                      <span className="admin-panel__instance-badge">×{res.producedQuantity} @ {Math.round(res.chance * 100)}%</span>
                      <button className="admin-panel__delete-btn" onClick={() => removeResult(recipe.id, res.id)}>✕</button>
                    </div>
                  );
                })}
                <div className="admin-panel__template-stats">
                  <label className="admin-panel__template-stat">
                    <span className="admin-panel__template-stat-label">Item</span>
                    <select className="admin-panel__template-stat-input"
                      value={resNew.itemId}
                      onChange={(e) => setNewRes((prev) => ({ ...prev, [recipe.id]: { ...(prev[recipe.id] ?? NEW_RES_DEFAULT), itemId: e.target.value } }))}
                      {...kbHandlers}>
                      <option value="">—</option>
                      {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.category})</option>)}
                    </select>
                  </label>
                  <label className="admin-panel__template-stat">
                    <span className="admin-panel__template-stat-label">Qté</span>
                    <input className="admin-panel__template-stat-input" type="number" min={1}
                      value={resNew.producedQuantity}
                      onChange={(e) => setNewRes((prev) => ({ ...prev, [recipe.id]: { ...(prev[recipe.id] ?? NEW_RES_DEFAULT), producedQuantity: Number(e.target.value) } }))}
                      {...kbHandlers} />
                  </label>
                  <label className="admin-panel__template-stat">
                    <span className="admin-panel__template-stat-label">Chance</span>
                    <input className="admin-panel__template-stat-input" type="number" min={0} max={1} step={0.05}
                      value={resNew.chance}
                      onChange={(e) => setNewRes((prev) => ({ ...prev, [recipe.id]: { ...(prev[recipe.id] ?? NEW_RES_DEFAULT), chance: Number(e.target.value) } }))}
                      {...kbHandlers} />
                  </label>
                  <button className="admin-panel__apply-btn" disabled={pending[`res-${recipe.id}`]} onClick={() => addResult(recipe.id)}>
                    {pending[`res-${recipe.id}`] ? "…" : "+ Résultat"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
