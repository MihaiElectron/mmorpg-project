import { useEffect, useMemo, useState } from "react";
import { fetchItemUsageStats } from "../Items/itemEditorApi";
import type {
  ItemCatalogEntry,
  ItemUsageStats,
} from "../Items/itemEditor.types";
import {
  fetchLootPoolData,
  updateCreatureLootPool,
  updateResourceLootPool,
} from "./lootPoolApi";
import {
  buildLootPoolPatch,
  filterItemsForLootPool,
  findItemByLootRef,
  validateLootPool,
} from "./lootPoolEditor";
import type {
  LootPoolEntry,
  LootPoolSource,
  LootSourceKind,
} from "./lootPool.types";
import "./LootPoolModule.scss";

const SOURCE_FILTERS: Array<{ kind: LootSourceKind; label: string }> = [
  { kind: "resource", label: "Resources" },
  { kind: "creature", label: "Creatures" },
];

function usageCount(stats: ItemUsageStats | null): number {
  if (!stats) return 0;
  return (
    stats.totalQuantityServer +
    stats.usedInResourceLootPools.length +
    stats.usedInCreatureLootPools.length +
    stats.usedInCraftRecipesOutput.length +
    stats.usedInCraftRecipesIngredient.length
  );
}

function entryKey(entry: LootPoolEntry, index: number): string {
  return `${entry.itemId}:${index}`;
}

function emptyEntry(item: ItemCatalogEntry): LootPoolEntry {
  return {
    itemId: item.category,
    minQty: 1,
    maxQty: 1,
    probability: 1,
  };
}

export default function LootPoolModule() {
  const [items, setItems] = useState<ItemCatalogEntry[]>([]);
  const [sources, setSources] = useState<LootPoolSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<LootSourceKind>("resource");
  const [entries, setEntries] = useState<LootPoolEntry[]>([]);
  const [savedEntries, setSavedEntries] = useState<LootPoolEntry[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<ItemUsageStats | null>(null);
  const [usageStatus, setUsageStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    fetchLootPoolData()
      .then((data) => {
        if (!mounted) return;
        setItems(data.items);
        setSources(data.sources);
        setSelectedSourceId((current) => current ?? data.sources[0]?.id ?? null);
        setStatus("loaded");
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setMessage(err.message);
        setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedSource = useMemo(
    () => sources.find((source) => source.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  useEffect(() => {
    const nextEntries = selectedSource?.lootPool ?? [];
    setEntries(nextEntries);
    setSavedEntries(nextEntries);
    setMessage(null);
    setSourceKind(selectedSource?.kind ?? sourceKind);
  }, [selectedSource?.id]);

  const inspectedItem = useMemo(
    () => items.find((item) => item.id === inspectedItemId) ?? null,
    [items, inspectedItemId],
  );

  useEffect(() => {
    if (!inspectedItem) {
      setUsageStats(null);
      setUsageStatus("idle");
      return;
    }
    let mounted = true;
    setUsageStats(null);
    setUsageStatus("loading");
    fetchItemUsageStats(inspectedItem.id)
      .then((stats) => {
        if (!mounted) return;
        setUsageStats(stats);
        setUsageStatus("loaded");
      })
      .catch(() => {
        if (!mounted) return;
        setUsageStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [inspectedItem?.id]);

  const visibleSources = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase();
    return sources.filter((source) => {
      if (source.kind !== sourceKind) return false;
      if (!q) return true;
      return [source.name, source.key].some((value) =>
        value.toLowerCase().includes(q),
      );
    });
  }, [sources, sourceKind, sourceQuery]);

  const filteredItems = useMemo(
    () => filterItemsForLootPool(items, itemQuery),
    [items, itemQuery],
  );

  const validation = useMemo(
    () => validateLootPool(entries, items),
    [entries, items],
  );
  const dirty = JSON.stringify(entries) !== JSON.stringify(savedEntries);
  const used = usageCount(usageStats) > 0;

  function updateEntry(
    index: number,
    key: keyof LootPoolEntry,
    value: string,
  ) {
    setEntries((current) =>
      current.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry;
        if (key === "itemId") return { ...entry, itemId: value };
        return { ...entry, [key]: Number(value) };
      }),
    );
  }

  function removeEntry(index: number) {
    setEntries((current) => current.filter((_, entryIndex) => entryIndex !== index));
  }

  function addItem(item: ItemCatalogEntry) {
    setEntries((current) => [...current, emptyEntry(item)]);
    setInspectedItemId(item.id);
  }

  function selectSourceKind(kind: LootSourceKind) {
    setSourceKind(kind);
    const nextSource = sources.find((source) => source.kind === kind);
    if (nextSource) setSelectedSourceId(nextSource.id);
  }

  async function handleSave() {
    if (!selectedSource || !dirty || !validation.valid) return;
    setSaving(true);
    setMessage(null);
    try {
      const patch = buildLootPoolPatch(entries);
      const saved =
        selectedSource.kind === "resource"
          ? await updateResourceLootPool(selectedSource.key, patch)
          : await updateCreatureLootPool(selectedSource.key, patch);
      setEntries(saved);
      setSavedEntries(saved);
      setSources((current) =>
        current.map((source) =>
          source.id === selectedSource.id
            ? { ...source, lootPool: saved }
            : source,
        ),
      );
      setMessage("Loot pool sauvegardee.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="loot-pool-editor" aria-label="LootPool Editor">
      <div className="loot-pool-editor__header">
        <h3 className="loot-pool-editor__title">LootPool Editor</h3>
        <span className="loot-pool-editor__count">
          {sources.length} source{sources.length > 1 ? "s" : ""}
        </span>
      </div>

      {status === "loading" && (
        <p className="loot-pool-editor__status">Chargement...</p>
      )}

      {status === "error" && (
        <p className="loot-pool-editor__status loot-pool-editor__status--error">
          {message ?? "Impossible de charger les loot pools."}
        </p>
      )}

      {status === "loaded" && (
        <div className="loot-pool-editor__body">
          <aside className="loot-pool-editor__sources" aria-label="Sources">
            <div className="loot-pool-editor__tabs">
              {SOURCE_FILTERS.map((filter) => (
                <button
                  key={filter.kind}
                  type="button"
                  className={
                    "loot-pool-editor__tab" +
                    (sourceKind === filter.kind
                      ? " loot-pool-editor__tab--active"
                      : "")
                  }
                  onClick={() => selectSourceKind(filter.kind)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <input
              className="loot-pool-editor__search"
              type="search"
              value={sourceQuery}
              onChange={(e) => setSourceQuery(e.target.value)}
              placeholder="Recherche source"
              aria-label="Rechercher une source"
            />
            <div className="loot-pool-editor__source-list">
              {visibleSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className={
                    "loot-pool-editor__source" +
                    (source.id === selectedSourceId
                      ? " loot-pool-editor__source--selected"
                      : "")
                  }
                  onClick={() => setSelectedSourceId(source.id)}
                >
                  <span className="loot-pool-editor__source-name">
                    {source.name}
                  </span>
                  <span className="loot-pool-editor__source-meta">
                    {source.key} / {source.lootPool.length} loot
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <div className="loot-pool-editor__pool">
            <div className="loot-pool-editor__panel-head">
              <span className="loot-pool-editor__panel-title">
                {selectedSource ? selectedSource.name : "Aucune source"}
              </span>
              <span
                className={
                  "loot-pool-editor__validity" +
                  (validation.valid ? "" : " loot-pool-editor__validity--bad")
                }
              >
                {validation.valid ? "Valide" : "Invalide"}
              </span>
            </div>

            {entries.length === 0 ? (
              <p className="loot-pool-editor__status">Loot pool vide.</p>
            ) : (
              <div className="loot-pool-editor__entries">
                {entries.map((entry, index) => {
                  const item = findItemByLootRef(items, entry.itemId);
                  const errors = validation.errorsByIndex[index] ?? [];
                  return (
                    <div
                      key={entryKey(entry, index)}
                      className={
                        "loot-pool-editor__entry" +
                        (errors.length > 0
                          ? " loot-pool-editor__entry--invalid"
                          : "")
                      }
                    >
                      <div className="loot-pool-editor__entry-item">
                        <span className="loot-pool-editor__item-icon">
                          {item?.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="loot-pool-editor__item-img"
                            />
                          ) : (
                            <span
                              className="loot-pool-editor__item-empty"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="loot-pool-editor__item-copy">
                          <span className="loot-pool-editor__item-name">
                            {item?.name ?? entry.itemId}
                          </span>
                          <span className="loot-pool-editor__item-meta">
                            {item ? `${item.type} / ${item.category}` : "Item inconnu"}
                          </span>
                        </span>
                      </div>

                      <label className="loot-pool-editor__field">
                        <span>Min</span>
                        <input
                          className="loot-pool-editor__input"
                          type="number"
                          min="1"
                          step="1"
                          value={entry.minQty}
                          onChange={(e) =>
                            updateEntry(index, "minQty", e.target.value)
                          }
                        />
                      </label>
                      <label className="loot-pool-editor__field">
                        <span>Max</span>
                        <input
                          className="loot-pool-editor__input"
                          type="number"
                          min="1"
                          step="1"
                          value={entry.maxQty}
                          onChange={(e) =>
                            updateEntry(index, "maxQty", e.target.value)
                          }
                        />
                      </label>
                      <label className="loot-pool-editor__field">
                        <span>Proba</span>
                        <input
                          className="loot-pool-editor__input"
                          type="number"
                          min="0.01"
                          max="1"
                          step="0.01"
                          value={entry.probability}
                          onChange={(e) =>
                            updateEntry(index, "probability", e.target.value)
                          }
                        />
                      </label>
                      <button
                        className="loot-pool-editor__remove"
                        type="button"
                        onClick={() => removeEntry(index)}
                      >
                        Supprimer
                      </button>
                      {errors.length > 0 && (
                        <p className="loot-pool-editor__errors">
                          {errors.join(" / ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="loot-pool-editor__actions">
              {message && (
                <span
                  className={
                    "loot-pool-editor__message" +
                    (message.includes("Erreur")
                      ? " loot-pool-editor__message--error"
                      : "")
                  }
                >
                  {message}
                </span>
              )}
              <button
                className="loot-pool-editor__save"
                type="button"
                onClick={handleSave}
                disabled={!dirty || !validation.valid || saving}
              >
                {saving ? "..." : "Sauver"}
              </button>
            </div>
          </div>

          <aside className="loot-pool-editor__catalog" aria-label="Items">
            <input
              className="loot-pool-editor__search"
              type="search"
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              placeholder="Recherche item"
              aria-label="Rechercher un item"
            />
            <div className="loot-pool-editor__catalog-list">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={
                    "loot-pool-editor__catalog-row" +
                    (item.id === inspectedItemId
                      ? " loot-pool-editor__catalog-row--selected"
                      : "")
                  }
                  role="button"
                  tabIndex={0}
                  onClick={() => setInspectedItemId(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setInspectedItemId(item.id);
                    }
                  }}
                >
                  <span className="loot-pool-editor__item-icon">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="loot-pool-editor__item-img"
                      />
                    ) : (
                      <span
                        className="loot-pool-editor__item-empty"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="loot-pool-editor__item-copy">
                    <span className="loot-pool-editor__item-name">
                      {item.name}
                    </span>
                    <span className="loot-pool-editor__item-meta">
                      {item.type} / {item.category}
                    </span>
                  </span>
                  <button
                    className="loot-pool-editor__add"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      addItem(item);
                    }}
                  >
                    Ajouter
                  </button>
                </div>
              ))}
            </div>
            <div className="loot-pool-editor__usage">
              <div className="loot-pool-editor__usage-head">
                <span className="loot-pool-editor__panel-title">
                  Utilisation item
                </span>
                <span
                  className={
                    "loot-pool-editor__validity" +
                    (used ? "" : " loot-pool-editor__validity--muted")
                  }
                >
                  {used ? "Utilise" : "Non utilise"}
                </span>
              </div>
              {!inspectedItem && (
                <p className="loot-pool-editor__status">Selection item.</p>
              )}
              {usageStatus === "loading" && (
                <p className="loot-pool-editor__status">Chargement usages...</p>
              )}
              {usageStatus === "error" && (
                <p className="loot-pool-editor__status loot-pool-editor__status--error">
                  Usages indisponibles.
                </p>
              )}
              {usageStatus === "loaded" && usageStats && (
                <div className="loot-pool-editor__usage-grid">
                  <span>Quantite: {usageStats.totalQuantityServer}</span>
                  <span>Piles: {usageStats.inventoryEntries}</span>
                  <span>Joueurs: {usageStats.uniqueCharacters}</span>
                  <span>
                    Ressources: {usageStats.usedInResourceLootPools.length}
                  </span>
                  <span>
                    Creatures: {usageStats.usedInCreatureLootPools.length}
                  </span>
                  <span>
                    Recettes:{" "}
                    {usageStats.usedInCraftRecipesOutput.length +
                      usageStats.usedInCraftRecipesIngredient.length}
                  </span>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
