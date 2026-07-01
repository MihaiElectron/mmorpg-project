import { useEffect, useMemo, useState } from "react";
import AssetPicker from "../../AssetPicker";
import { createItem, fetchItems, fetchItemUsageStats, updateItem } from "./itemEditorApi";
import {
  ALL_FILTER,
  buildItemCreateInput,
  buildItemPatch,
  draftFromItem,
  filterItems,
  isValidItemDraft,
  uniqueSorted,
} from "./itemEditorFilters";
import type {
  ItemCatalogEntry,
  ItemEditorDraft,
  ItemUsageRef,
  ItemUsageStats,
} from "./itemEditor.types";
import { EQUIPMENT_SLOTS, ITEM_CATEGORIES_BY_TYPE, ITEM_TYPES, OBJECT_MODES, WEAPON_TYPES } from "./itemEditor.types";
import "./ItemsModule.scss";

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function emptyDraft(): ItemEditorDraft {
  return { name: "", type: "", category: "", image: "", objectMode: "STACKABLE", slot: "", attack: "", defense: "", range: "", weaponType: "" };
}

function hasGameplayUsage(stats: ItemUsageStats | null): boolean {
  if (!stats) return false;
  return (
    stats.totalQuantityServer > 0 ||
    stats.usedInResourceLootPools.length > 0 ||
    stats.usedInCreatureLootPools.length > 0 ||
    stats.usedInCraftRecipesOutput.length > 0 ||
    stats.usedInCraftRecipesIngredient.length > 0
  );
}

function usageLabel(ref: ItemUsageRef): string {
  if (ref.type) return ref.type;
  if (ref.key && ref.name) return `${ref.name} (${ref.key})`;
  if (ref.key) return ref.key;
  if (ref.name) return ref.name;
  return String(ref.id);
}

function UsageList({ items }: { items: ItemUsageRef[] }) {
  if (items.length === 0) {
    return <span className="item-editor__usage-empty">Aucun</span>;
  }
  return (
    <div className="item-editor__usage-list">
      {items.map((item) => (
        <span key={String(item.id)} className="item-editor__usage-chip">
          {usageLabel(item)}
        </span>
      ))}
    </div>
  );
}

export default function ItemsModule() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ItemCatalogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ItemEditorDraft>(emptyDraft);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<ItemEditorDraft>(emptyDraft);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState(ALL_FILTER);
  const [categoryFilter, setCategoryFilter] = useState(ALL_FILTER);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [usageStats, setUsageStats] = useState<ItemUsageStats | null>(null);
  const [usageStatus, setUsageStatus] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    fetchItems()
      .then((data) => {
        if (!mounted) return;
        setItems(data);
        setSelectedId((current) => current ?? data[0]?.id ?? null);
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

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    setDraft(selectedItem ? draftFromItem(selectedItem) : emptyDraft());
    setMessage(null);
  }, [selectedItem?.id]);

  useEffect(() => {
    if (!selectedItem) {
      setUsageStats(null);
      setUsageStatus("idle");
      return;
    }

    let mounted = true;
    setUsageStats(null);
    setUsageStatus("loading");
    fetchItemUsageStats(selectedItem.id)
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
  }, [selectedItem?.id]);

  const typeOptions = useMemo(
    () => uniqueSorted(items.map((item) => item.type)),
    [items],
  );
  const categoryOptions = useMemo(
    () => uniqueSorted(items.map((item) => item.category)),
    [items],
  );
  const filteredItems = useMemo(
    () => filterItems(items, query, typeFilter, categoryFilter),
    [items, query, typeFilter, categoryFilter],
  );
  const patch = selectedItem ? buildItemPatch(selectedItem, draft) : {};
  const dirty = Object.keys(patch).length > 0;
  const valid = isValidItemDraft(draft);
  const createValid = isValidItemDraft(createDraft);
  const used = hasGameplayUsage(usageStats);

  function updateDraft(key: keyof ItemEditorDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateCreateDraft(key: keyof ItemEditorDraft, value: string) {
    setCreateDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleCreate() {
    if (!createValid) return;
    setCreating(true);
    setMessage(null);
    try {
      const created = await createItem(buildItemCreateInput(createDraft));
      const refreshed = await fetchItems();
      setItems(refreshed);
      setSelectedId(created.id);
      setCreateDraft(emptyDraft());
      setCreateOpen(false);
      setMessage("Item créé.");
      window.dispatchEvent(new CustomEvent("devtools:items-changed"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur création.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSave() {
    if (!selectedItem || !dirty || !valid) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateItem(selectedItem.id, patch);
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedId(updated.id);
      setDraft(draftFromItem(updated));
      setMessage("Item sauvegardé.");
      window.dispatchEvent(new CustomEvent("devtools:items-changed"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erreur sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="item-editor" aria-label="Item Editor DevTools module">
      <div
        className="item-editor__header"
        onClick={() => setOpen((current) => !current)}
      >
        <h3 className="item-editor__title">
          <span className="item-editor__chevron">{open ? "▼" : "▶"}</span>
          Item Editor
        </h3>
        <span className="item-editor__count">
          {items.length} item{items.length > 1 ? "s" : ""}
        </span>
      </div>

      {open && (
        <>
      <div className="item-editor__create-head">
        <button
          className="item-editor__create-toggle"
          type="button"
          onClick={() => setCreateOpen((current) => !current)}
        >
          <span className="item-editor__chevron">{createOpen ? "▼" : "▶"}</span>
          Créer item
        </button>
      </div>

      <datalist id="item-types-list">
        {ITEM_TYPES.map((t) => <option key={t} value={t} />)}
      </datalist>
      <datalist id="weapon-types-list">
        {WEAPON_TYPES.map((w) => <option key={w} value={w} />)}
      </datalist>

      {createOpen && (
        <form
          className="item-editor__create-form"
          onSubmit={(e) => e.preventDefault()}
        >
          <label className="item-editor__field">
            <span className="item-editor__label">Name</span>
            <input
              className="item-editor__input"
              value={createDraft.name}
              onChange={(e) => updateCreateDraft("name", e.target.value)}
            />
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Type</span>
            <input
              className="item-editor__input"
              list="item-types-list"
              value={createDraft.type}
              onChange={(e) => updateCreateDraft("type", e.target.value)}
            />
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Category</span>
            <input
              className="item-editor__input"
              list="item-categories-list-create"
              value={createDraft.category}
              onChange={(e) => updateCreateDraft("category", e.target.value)}
            />
            <datalist id="item-categories-list-create">
              {(ITEM_CATEGORIES_BY_TYPE[createDraft.type] ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Image</span>
            <AssetPicker
              value={createDraft.image}
              onChange={(path) => updateCreateDraft("image", path)}
              category="images"
            />
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">objectMode</span>
            <select
              className="item-editor__input"
              value={createDraft.objectMode}
              onChange={(e) => updateCreateDraft("objectMode", e.target.value)}
            >
              {OBJECT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Slot</span>
            <select
              className="item-editor__input"
              value={createDraft.slot}
              onChange={(e) => updateCreateDraft("slot", e.target.value)}
            >
              <option value="">— aucun —</option>
              {EQUIPMENT_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Attack</span>
            <input
              className="item-editor__input item-editor__input--num"
              type="number"
              value={createDraft.attack}
              onChange={(e) => updateCreateDraft("attack", e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Defense</span>
            <input
              className="item-editor__input item-editor__input--num"
              type="number"
              value={createDraft.defense}
              onChange={(e) => updateCreateDraft("defense", e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Range</span>
            <input
              className="item-editor__input item-editor__input--num"
              type="number"
              value={createDraft.range}
              onChange={(e) => updateCreateDraft("range", e.target.value)}
              placeholder=""
            />
          </label>
          <label className="item-editor__field">
            <span className="item-editor__label">Type d&apos;arme</span>
            <input
              className="item-editor__input"
              list="weapon-types-list"
              value={createDraft.weaponType}
              onChange={(e) => updateCreateDraft("weaponType", e.target.value)}
              placeholder="— aucun —"
            />
          </label>
          <button
            className="item-editor__save"
            type="button"
            onClick={handleCreate}
            disabled={!createValid || creating}
          >
            {creating ? "…" : "Créer"}
          </button>
        </form>
      )}

      <div className="item-editor__toolbar">
        <input
          className="item-editor__search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Recherche"
          aria-label="Rechercher un item"
        />
        <select
          className="item-editor__filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filtrer par type"
        >
          <option value={ALL_FILTER}>Tous types</option>
          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <select
          className="item-editor__filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filtrer par category"
        >
          <option value={ALL_FILTER}>Toutes catégories</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {status === "error" && (
        <p className="item-editor__status item-editor__status--error">
          {message ?? "Impossible de charger les items."}
        </p>
      )}

      {status === "loading" && (
        <p className="item-editor__status">Chargement…</p>
      )}

      {status === "loaded" && (
        <div className="item-editor__body">
          <div className="item-editor__list" aria-label="Items">
            {filteredItems.length === 0 ? (
              <p className="item-editor__status">Aucun résultat.</p>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    "item-editor__row" +
                    (item.id === selectedId
                      ? " item-editor__row--selected"
                      : "")
                  }
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="item-editor__row-icon">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="item-editor__row-img"
                      />
                    ) : (
                      <span
                        className="item-editor__row-empty"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="item-editor__row-main">
                    <span className="item-editor__row-name">{item.name}</span>
                    <span className="item-editor__row-meta">
                      {item.type} / {item.category}
                    </span>
                  </span>
                  <span className="item-editor__row-id">
                    {shortId(item.id)}
                  </span>
                </button>
              ))
            )}
          </div>

          <form
            className="item-editor__form"
            onSubmit={(e) => e.preventDefault()}
          >
            {selectedItem ? (
              <>
                <div className="item-editor__preview">
                  <div className="item-editor__preview-icon">
                    {draft.image.trim() ? (
                      <img
                        src={draft.image.trim()}
                        alt={draft.name || selectedItem.name}
                        className="item-editor__preview-img"
                      />
                    ) : (
                      <span className="item-editor__preview-empty">∅</span>
                    )}
                  </div>
                  <div className="item-editor__preview-copy">
                    <span className="item-editor__preview-name">
                      {selectedItem.name}
                    </span>
                    <span className="item-editor__preview-id">
                      {selectedItem.id}
                    </span>
                  </div>
                </div>

                <label className="item-editor__field">
                  <span className="item-editor__label">Name</span>
                  <input
                    className="item-editor__input"
                    value={draft.name}
                    onChange={(e) => updateDraft("name", e.target.value)}
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Type</span>
                  <input
                    className="item-editor__input"
                    list="item-types-list"
                    value={draft.type}
                    onChange={(e) => updateDraft("type", e.target.value)}
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Category</span>
                  <input
                    className="item-editor__input"
                    list="item-categories-list-edit"
                    value={draft.category}
                    onChange={(e) => updateDraft("category", e.target.value)}
                  />
                  <datalist id="item-categories-list-edit">
                    {(ITEM_CATEGORIES_BY_TYPE[draft.type] ?? []).map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Image</span>
                  <AssetPicker
                    value={draft.image}
                    onChange={(path) => updateDraft("image", path)}
                    category="images"
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">objectMode</span>
                  <select
                    className="item-editor__input"
                    value={draft.objectMode}
                    onChange={(e) => updateDraft("objectMode", e.target.value)}
                  >
                    {OBJECT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Slot</span>
                  <select
                    className="item-editor__input"
                    value={draft.slot}
                    onChange={(e) => updateDraft("slot", e.target.value)}
                  >
                    <option value="">— aucun —</option>
                    {EQUIPMENT_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Attack</span>
                  <input
                    className="item-editor__input item-editor__input--num"
                    type="number"
                    value={draft.attack}
                    onChange={(e) => updateDraft("attack", e.target.value)}
                    placeholder="0"
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Defense</span>
                  <input
                    className="item-editor__input item-editor__input--num"
                    type="number"
                    value={draft.defense}
                    onChange={(e) => updateDraft("defense", e.target.value)}
                    placeholder="0"
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Range</span>
                  <input
                    className="item-editor__input item-editor__input--num"
                    type="number"
                    value={draft.range}
                    onChange={(e) => updateDraft("range", e.target.value)}
                    placeholder=""
                  />
                </label>

                <label className="item-editor__field">
                  <span className="item-editor__label">Type d&apos;arme</span>
                  <input
                    className="item-editor__input"
                    list="weapon-types-list"
                    value={draft.weaponType}
                    onChange={(e) => updateDraft("weaponType", e.target.value)}
                    placeholder="— aucun —"
                  />
                </label>

                <div className="item-editor__usage">
                  <div className="item-editor__usage-header">
                    <span className="item-editor__usage-title">
                      Utilisation
                    </span>
                    <span
                      className={
                        "item-editor__usage-badge" +
                        (used ? " item-editor__usage-badge--used" : "")
                      }
                    >
                      {used ? "Utilisé" : "Non utilisé"}
                    </span>
                  </div>

                  {usageStatus === "loading" && (
                    <p className="item-editor__status">Chargement usages…</p>
                  )}
                  {usageStatus === "error" && (
                    <p className="item-editor__status item-editor__status--error">
                      Impossible de charger les usages.
                    </p>
                  )}
                  {usageStatus === "loaded" && usageStats && (
                    <>
                      <div className="item-editor__usage-grid">
                        <div className="item-editor__usage-metric">
                          <span className="item-editor__usage-value">
                            {usageStats.totalQuantityServer}
                          </span>
                          <span className="item-editor__usage-label">
                            Quantité
                          </span>
                        </div>
                        <div className="item-editor__usage-metric">
                          <span className="item-editor__usage-value">
                            {usageStats.inventoryEntries}
                          </span>
                          <span className="item-editor__usage-label">
                            Piles
                          </span>
                        </div>
                        <div className="item-editor__usage-metric">
                          <span className="item-editor__usage-value">
                            {usageStats.uniqueCharacters}
                          </span>
                          <span className="item-editor__usage-label">
                            Joueurs
                          </span>
                        </div>
                      </div>

                      <div className="item-editor__usage-block">
                        <span className="item-editor__usage-label">
                          Ressources loot
                        </span>
                        <UsageList items={usageStats.usedInResourceLootPools} />
                      </div>
                      <div className="item-editor__usage-block">
                        <span className="item-editor__usage-label">
                          Créatures loot
                        </span>
                        <UsageList items={usageStats.usedInCreatureLootPools} />
                      </div>
                      <div className="item-editor__usage-block">
                        <span className="item-editor__usage-label">
                          Recettes output
                        </span>
                        <UsageList
                          items={usageStats.usedInCraftRecipesOutput}
                        />
                      </div>
                      <div className="item-editor__usage-block">
                        <span className="item-editor__usage-label">
                          Recettes ingrédient
                        </span>
                        <UsageList
                          items={usageStats.usedInCraftRecipesIngredient}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="item-editor__actions">
                  {message && (
                    <span
                      className={
                        "item-editor__message" +
                        (message.includes("Erreur")
                          ? " item-editor__message--error"
                          : "")
                      }
                    >
                      {message}
                    </span>
                  )}
                  <button
                    className="item-editor__save"
                    type="button"
                    onClick={handleSave}
                    disabled={!dirty || !valid || saving}
                  >
                    {saving ? "…" : "Sauver"}
                  </button>
                </div>
              </>
            ) : (
              <p className="item-editor__status">Aucun item sélectionné.</p>
            )}
          </form>
        </div>
      )}
        </>
      )}
    </section>
  );
}
