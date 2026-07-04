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
} from "./craftingRuntime";
import {
  craftJobProgress,
  craftJobRemainingMs,
  formatRemaining,
  groupCraftJobs,
  isClaimable,
  CRAFT_JOB_POLL_MS,
  type CraftJobDto,
} from "./craftJobs";

const API = import.meta.env.VITE_API_URL as string;

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
  const [query, setQuery] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<"recipes" | "jobs">("recipes");
  const [jobs, setJobs] = useState<CraftJobDto[]>([]);
  const [claimingJobId, setClaimingJobId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

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

  // ── CraftJobs (liste des fabrications) ─────────────────────────────────────
  async function fetchJobs() {
    const token = localStorage.getItem("token") ?? "";
    if (!token) return;
    try {
      const res = await fetch(`${API}/crafting/jobs`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      setJobs((await res.json()) as CraftJobDto[]);
    } catch {
      // polling silencieux : on réessaie au tick suivant
    }
  }

  // Rafraîchit inventaire/skills/personnage sans recharger la scène.
  async function refreshCharacter() {
    await Promise.all([loadCharacter(), loadSkills()]);
  }

  /**
   * Action joueur UNIQUE « Fabriquer ». Le serveur crée toujours un CraftJob
   * (`mode: "job"`) : les ingrédients sont réservés et aucun output n'existe
   * tant que le claim n'a pas eu lieu. L'UI bascule sur l'onglet Production.
   */
  async function execute(recipe: AvailableCraftingRecipe) {
    const token = localStorage.getItem("token") ?? "";
    if (!token) {
      setError({ message: "Non authentifié." });
      return;
    }
    setCraftingRecipeId(recipe.id);
    setError(null);
    try {
      const res = await fetch(`${API}/crafting/craft`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(buildCraftRequestPayload(recipe.id, quantity)),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw parseCraftingServerError(body, `Erreur ${res.status}`);

      // Réponse serveur : toujours un CraftJob (mode "job"). Fabrication lancée,
      // ingrédients réservés, aucun output tant que le claim n'a pas eu lieu.
      await Promise.all([fetchJobs(), loadCharacter()]);
      setActiveTab("jobs");
    } catch (err) {
      setError(isCraftingServerError(err) ? err : { message: "Fabrication impossible." });
    } finally {
      setCraftingRecipeId(null);
    }
  }

  async function claimJob(jobId: string) {
    const token = localStorage.getItem("token") ?? "";
    if (!token) return;
    setClaimingJobId(jobId);
    setError(null);
    try {
      const res = await fetch(`${API}/crafting/jobs/${jobId}/claim`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw parseCraftingServerError(body, `Erreur ${res.status}`);
      await Promise.all([fetchJobs(), refreshCharacter()]);
    } catch (err) {
      setError(isCraftingServerError(err) ? err : { message: "Réclamation impossible." });
    } finally {
      setClaimingJobId(null);
    }
  }

  // Chargement initial + polling simple toutes les 10 s (cohérent avec le
  // scheduler serveur à 10 s ; remplaçable par websocket plus tard). Le polling
  // vit tant que le panneau craft est monté.
  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, CRAFT_JOB_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rafraîchit immédiatement en ouvrant l'onglet Production (sans attendre le tick).
  useEffect(() => {
    if (activeTab === "jobs") fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Tick 1 s pour animer les barres de progression tant qu'un job tourne.
  const grouped = useMemo(() => groupCraftJobs(jobs), [jobs]);
  useEffect(() => {
    if (activeTab !== "jobs" || grouped.running.length === 0) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeTab, grouped.running.length]);

  // Finalisation : temps écoulé mais job encore RUNNING (en attente du scheduler).
  // On poll alors plus vite (2 s) pour afficher « Réclamer » sans délai perceptible.
  const hasFinalizing = grouped.running.some(
    (job) => craftJobRemainingMs(job.finishAt, nowTick) <= 0,
  );
  useEffect(() => {
    if (!hasFinalizing) return;
    const id = setInterval(fetchJobs, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFinalizing]);


  return (
    <div className="action-panel__crafting">
      <div className="action-panel__crafting-header">
        <span className="action-panel__crafting-title">{station.name ?? stationType}</span>
        <button className="action-panel__crafting-close" onClick={onClose} aria-label="Fermer le craft">
          ×
        </button>
      </div>

      <div className="action-panel__craft-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`action-panel__craft-tab${activeTab === "recipes" ? " is-active" : ""}`}
          onClick={() => setActiveTab("recipes")}
        >
          Recettes
        </button>
        <button
          type="button"
          role="tab"
          className={`action-panel__craft-tab${activeTab === "jobs" ? " is-active" : ""}`}
          onClick={() => setActiveTab("jobs")}
        >
          Production{grouped.running.length > 0 ? ` (${grouped.running.length})` : ""}
        </button>
      </div>

      {error && (
        <div className="action-panel__crafting-error">
          <span>{error.message}</span>
          {errorDetail && <span className="action-panel__crafting-error-detail">{errorDetail}</span>}
        </div>
      )}

      {activeTab === "recipes" && (
        <>
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
              <button
                type="button"
                className="action-panel__craft-qty-btn action-panel__craft-qty-max"
                onClick={() => setQuantity(clampQuantity(Math.max(1, maxCraftable)))}
                disabled={maxCraftable < 1 || quantity >= maxCraftable}
                aria-label="Quantité maximale"
              >
                MAX
              </button>
            </div>
            <span className="action-panel__craft-maxinfo">Maximum fabricable : {maxCraftable}</span>
          </div>

          <button
            className="action-panel__button action-panel__craft-submit"
            disabled={!canCraft}
            onClick={() => execute(selectedRecipe)}
          >
            {isCrafting ? "Fabrication…" : "Fabriquer"}
          </button>
        </div>
      )}

        </>
      )}

      {activeTab === "jobs" && (
        <div className="action-panel__jobs">
          {jobs.length === 0 && (
            <p className="action-panel__crafting-muted">Aucune production lancée.</p>
          )}

          {grouped.running.length > 0 && (
            <div className="action-panel__jobs-group">
              <span className="action-panel__craft-section-label">Productions en cours</span>
              {grouped.running.map((job) => {
                const remaining = craftJobRemainingMs(job.finishAt, nowTick);
                return (
                  <div key={job.jobId} className="action-panel__job">
                    <div className="action-panel__job-head">
                      <span className="action-panel__job-name">{job.recipeName} ×{job.quantity}</span>
                      <span className="action-panel__job-time">
                        {remaining > 0 ? formatRemaining(remaining) : "Finalisation…"}
                      </span>
                    </div>
                    <progress
                      className="action-panel__job-progress"
                      value={craftJobProgress(job.startedAt, job.finishAt, nowTick)}
                      max={1}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {grouped.completed.length > 0 && (
            <div className="action-panel__jobs-group">
              <span className="action-panel__craft-section-label">Terminées</span>
              {grouped.completed.map((job) => (
                <div key={job.jobId} className="action-panel__job action-panel__job--completed">
                  <div className="action-panel__job-head">
                    <span className="action-panel__job-name">{job.recipeName} ×{job.quantity}</span>
                    <span className="action-panel__job-badge action-panel__job-badge--ok">COMPLETED</span>
                  </div>
                  <span className="action-panel__job-meta">Succès {job.successes} · Échecs {job.failures}</span>
                  {job.outputs.filter((o) => o.resolvedQuantity > 0).length > 0 && (
                    <div className="action-panel__job-outputs">
                      {job.outputs.filter((o) => o.resolvedQuantity > 0).map((o) => (
                        <span key={o.itemId} className="action-panel__job-output">
                          {o.itemImage && (
                            <img className="action-panel__job-output-img" src={o.itemImage} alt="" aria-hidden="true" />
                          )}
                          {o.itemName} ×{o.resolvedQuantity}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    className="action-panel__button action-panel__job-claim"
                    disabled={!isClaimable(job) || claimingJobId === job.jobId}
                    onClick={() => claimJob(job.jobId)}
                  >
                    {claimingJobId === job.jobId ? "Réclamation…" : "Réclamer"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {grouped.failed.length > 0 && (
            <div className="action-panel__jobs-group">
              <span className="action-panel__craft-section-label">Échouées</span>
              {grouped.failed.map((job) => (
                <div key={job.jobId} className="action-panel__job action-panel__job--failed">
                  <div className="action-panel__job-head">
                    <span className="action-panel__job-name">{job.recipeName} ×{job.quantity}</span>
                    <span className="action-panel__job-badge action-panel__job-badge--fail">FAILED</span>
                  </div>
                  <span className="action-panel__job-meta">Succès {job.successes} · Échecs {job.failures}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function isCraftingServerError(value: unknown): value is CraftingServerError {
  return Boolean(value && typeof value === "object" && typeof (value as CraftingServerError).message === "string");
}
